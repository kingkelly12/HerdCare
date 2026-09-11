import type { Env, FarmRow } from './types';
import { daysBetweenYmd, todayInNairobi } from './plans';
import { sendSms } from './sms';
import { GRACE_DAYS } from './subscription';

/**
 * The nightly job: tell a farmer their subscription is about to lapse, and tell their agent.
 *
 * Runs on a cron trigger rather than being computed when someone opens the app, because the whole
 * point is to reach a farmer who has *not* opened it.
 */

/** How many days before expiry the warning goes out. */
const WARN_DAYS = 3;

export async function sendRenewalNotices(env: Env): Promise<{ checked: number; sent: number; skipped: number }> {
  const today = todayInNairobi();

  // A window rather than an exact date, so a day when the job fails to run does not silently skip
  // everybody who happened to be due that morning.
  const { results } = await env.DB.prepare(
    `SELECT * FROM farms
     WHERE expires_at >= date(?, '-${GRACE_DAYS} days') AND expires_at <= date(?, '+${WARN_DAYS} days')
     ORDER BY expires_at ASC LIMIT 500`,
  )
    .bind(today, today)
    .all<FarmRow>();

  const farms = results ?? [];
  let sent = 0;
  let skipped = 0;

  const sms = {
    username: env.SMS_USERNAME,
    apiKey: env.SMS_API_KEY,
    senderId: env.SMS_SENDER_ID,
    allowDevFallback: env.ALLOW_DEV_OTP === 'true',
  };

  for (const farm of farms) {
    const daysLeft = daysBetweenYmd(today, farm.expires_at);
    const kind = daysLeft >= 0 ? 'expiring' : 'lapsed';

    // The unique index on (farm_id, kind, about_date) is what stops a farmer being told the same
    // thing every morning until they pay. Insert first; if it collides, we have already said it.
    const claim = await env.DB.prepare(
      'INSERT OR IGNORE INTO notices (id, farm_id, kind, about_date, channel) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(crypto.randomUUID(), farm.id, kind, farm.expires_at, 'sms')
      .run();

    if (!claim.meta.changes) {
      skipped++;
      continue;
    }

    const message =
      daysLeft > 0
        ? `Your HerdCare subscription ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Open the app to renew by M-Pesa.`
        : daysLeft === 0
          ? 'Your HerdCare subscription ends today. Open the app to renew by M-Pesa.'
          : `Your HerdCare subscription has ended. Your records are safe. Renew in the app to log again.`;

    const result = await sendSms(sms, `+${farm.phone}`, message);
    if (result.sent || result.devCode !== undefined) sent++;
  }

  return { checked: farms.length, sent, skipped };
}
