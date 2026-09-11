import { Hono } from 'hono';
import type { Env, FarmRow } from '../types';
import { randomOtp, randomToken, sha256Hex } from '../crypto';
import { normalisePhone } from '../license';
import { sendSms } from '../sms';
import { todayInNairobi } from '../plans';
import { issueToken } from '../subscription';

/**
 * Proving a farmer still holds their phone number, and putting them back on a new handset.
 *
 * This is the answer to "what happens when a phone is lost or replaced". The number is the
 * identity: it is the M-Pesa number, it is already inside every licence token, and it survives the
 * handset. A stolen phone does not take the number, because Safaricom reissues the SIM.
 *
 * So recovery is a flow every Kenyan farmer already performs several times a week: receive a code
 * by SMS, type it in. No password to forget, no email address many of them do not have.
 */

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
/** How many codes one number may be sent in an hour, so nobody can run up an SMS bill on us. */
const OTP_MAX_PER_HOUR = 5;

export const auth = new Hono<{ Bindings: Env }>();

auth.post('/request', async (c) => {
  const body = await c.req.json().catch(() => null);
  const rawPhone = (body as any)?.phone;
  if (typeof rawPhone !== 'string' || !rawPhone.trim()) {
    return c.json({ error: 'Enter your M-Pesa number.' }, 400);
  }

  const phone = normalisePhone(rawPhone);
  if (phone.length < 12) return c.json({ error: 'That does not look like a Kenyan number.' }, 400);

  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ? AND created_at > ?')
    .bind(phone, anHourAgo)
    .first<{ n: number }>();

  if ((recent?.n ?? 0) >= OTP_MAX_PER_HOUR) {
    return c.json({ error: 'Too many codes requested. Try again in an hour.' }, 429);
  }

  const code = randomOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO otp_codes (id, phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), phone, await sha256Hex(code), 'recover', expiresAt)
    .run();

  const result = await sendSms(
    {
      username: c.env.SMS_USERNAME,
      apiKey: c.env.SMS_API_KEY,
      senderId: c.env.SMS_SENDER_ID,
      allowDevFallback: c.env.ALLOW_DEV_OTP === 'true',
    },
    `+${phone}`,
    `${code} is your HerdCare code. It expires in ${OTP_TTL_MINUTES} minutes.`,
    code,
  );

  if (!result.sent && !result.devCode) {
    // SMS being off is a deliberate, supported configuration, not a broken server. Point the
    // farmer at the channel that does exist rather than leaving them stuck.
    return c.json(
      {
        error: 'We cannot send you a code by SMS. Ask your HerdCare agent for a code instead.',
        agentRecoveryAvailable: true,
      },
      503,
    );
  }

  // Deliberately says nothing about whether this number has an account. Answering that would turn
  // this endpoint into a way to check who is a customer.
  return c.json({
    sent: true,
    expiresInMinutes: OTP_TTL_MINUTES,
    message: 'We sent you a code by SMS.',
    ...(result.devCode ? { devCode: result.devCode } : {}),
  });
});

/**
 * Exchanges a code for a device token, the farmer's licence, and whatever backup is waiting.
 *
 * One call returns everything a replacement phone needs, because the farmer standing in a shop
 * with a new handset should not have to perform three separate recoveries.
 */
auth.post('/verify', async (c) => {
  const body = await c.req.json().catch(() => null);
  const rawPhone = (body as any)?.phone;
  const code = (body as any)?.code;

  if (typeof rawPhone !== 'string' || typeof code !== 'string') {
    return c.json({ error: 'Enter your number and the code we sent you.' }, 400);
  }

  const phone = normalisePhone(rawPhone);

  const record = await c.env.DB.prepare(
    `SELECT * FROM otp_codes
     WHERE phone = ? AND consumed_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(phone, new Date().toISOString())
    .first<{ id: string; code_hash: string; attempts: number }>();

  if (!record) return c.json({ error: 'That code has expired. Ask for a new one.' }, 400);

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return c.json({ error: 'Too many wrong tries. Ask for a new code.' }, 429);
  }

  if ((await sha256Hex(code.trim())) !== record.code_hash) {
    // Count the attempt before returning, or the ceiling is decorative.
    await c.env.DB.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
    return c.json({ error: 'That code is not right.', triesLeft: OTP_MAX_ATTEMPTS - record.attempts - 1 }, 400);
  }

  await c.env.DB.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), record.id)
    .run();

  const farm = await c.env.DB.prepare('SELECT * FROM farms WHERE phone = ?').bind(phone).first<FarmRow>();

  if (!farm) {
    await logRecovery(c.env, null, phone, 'no-account', null);
    return c.json(
      { error: 'That number has no HerdCare subscription yet. Ask your agent to set one up.' },
      404,
    );
  }

  // A recovery means the farmer is on a different handset. Old device tokens are revoked so a
  // phone that was lost or sold cannot keep pushing stale records over the new one.
  await c.env.DB.prepare('UPDATE devices SET revoked_at = ? WHERE farm_id = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), farm.id)
    .run();

  const token = randomToken();
  const deviceId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO devices (id, farm_id, token_hash, label, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .bind(deviceId, farm.id, await sha256Hex(token), (body as any)?.label ?? null, new Date().toISOString())
    .run();

  await logRecovery(c.env, farm.id, phone, 'recovered', deviceId);

  const backup = await c.env.DB.prepare(
    'SELECT size_bytes, record_count, updated_at FROM backups WHERE farm_id = ?',
  )
    .bind(farm.id)
    .first<{ size_bytes: number; record_count: number; updated_at: string }>();

  return c.json({
    deviceToken: token,
    // The licence travels with the sign-in rather than needing a second call. A farmer standing in
    // a shop with a new handset should perform one recovery, not three.
    token: await issueToken(c.env, farm, 'recover'),
    farm: {
      phone: farm.phone,
      name: farm.name,
      plan: farm.plan,
      expiresAt: farm.expires_at,
      today: todayInNairobi(),
    },
    backup: backup
      ? { available: true, sizeBytes: backup.size_bytes, records: backup.record_count, savedAt: backup.updated_at }
      : { available: false },
  });
});

async function logRecovery(
  env: Env,
  farmId: string | null,
  phone: string,
  outcome: string,
  deviceId: string | null,
) {
  await env.DB.prepare('INSERT INTO recovery_log (id, farm_id, phone, outcome, device_id) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), farmId, phone, outcome, deviceId)
    .run();
}

/** Resolves a device bearer token to the farm it belongs to, or null. */
export async function farmForDeviceToken(env: Env, token: string | undefined): Promise<{ farm: FarmRow; deviceId: string } | null> {
  if (!token) return null;

  const device = await env.DB.prepare(
    'SELECT id, farm_id FROM devices WHERE token_hash = ? AND revoked_at IS NULL',
  )
    .bind(await sha256Hex(token))
    .first<{ id: string; farm_id: string }>();

  if (!device) return null;

  const farm = await env.DB.prepare('SELECT * FROM farms WHERE id = ?').bind(device.farm_id).first<FarmRow>();
  if (!farm) return null;

  await env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), device.id)
    .run();

  return { farm, deviceId: device.id };
}
