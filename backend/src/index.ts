import { Hono } from 'hono';
import type { AgentRow, Env, FarmRow } from './types';
import { normalisePhone, readUnverifiedPayload } from './license';
import { PLAN_PRICES, PRICE_CURRENCY, isPlan, todayInNairobi } from './plans';
import { applyPayment, describeFarm, issueToken } from './subscription';
import { randomOtp, randomToken, secretsMatch, sha256Hex } from './crypto';
import { sendRenewalNotices } from './reminders';
import { getPaymentProvider } from './payments';
import { auth } from './routes/auth';
import { backup } from './routes/backup';
import { pay } from './routes/pay';
import { agents } from './routes/agents';

const app = new Hono<{ Bindings: Env }>();

/** Guards every endpoint that can issue a code or move money. */
async function requireAdmin(c: any, next: any) {
  const header = c.req.header('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = c.env.ADMIN_TOKEN ?? '';

  if (!expected) return c.json({ error: 'Server is missing ADMIN_TOKEN. See the README.' }, 500);
  if (!presented || !secretsMatch(presented, expected)) return c.json({ error: 'Not authorised.' }, 401);
  return next();
}


/** Admin, or an agent holding a valid key. Agents support their own farmers, so they need this. */
async function requireAdminOrAgent(c: any, next: any) {
  const header = c.req.header('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!presented) return c.json({ error: 'Not authorised.' }, 401);

  if (c.env.ADMIN_TOKEN && secretsMatch(presented, c.env.ADMIN_TOKEN)) return next();

  // `c` is loosely typed here because Hono's middleware signature is, so name the binding to get
  // D1's own types back rather than reaching through `any`.
  const database = c.env.DB as D1Database;
  const agent = await database
    .prepare('SELECT code FROM agents WHERE api_key_hash = ? AND active = 1')
    .bind(await sha256Hex(presented))
    .first<{ code: string }>();

  if (!agent) return c.json({ error: 'Not authorised.' }, 401);
  return next();
}

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'herdcare-licences',
    today: todayInNairobi(),
    payments: getPaymentProvider(c.env).isConfigured(),
    sms: Boolean(c.env.SMS_USERNAME && c.env.SMS_API_KEY),
  }),
);

app.route('/auth', auth);
app.route('/backup', backup);
app.route('/pay', pay);
app.route('/agents', agents);

/**
 * Activates a farm, or renews one that already exists.
 *
 * One endpoint for both, because they are the same operation: a farm is given dates covering a
 * period. Splitting them would only invite the bug where renewing early throws away days already
 * paid for.
 */
app.post('/activate', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'Expected a JSON body.' }, 400);

  const { phone, name, plan, agent, mpesaRef, amount } = body as Record<string, unknown>;

  if (typeof phone !== 'string' || !phone.trim()) return c.json({ error: 'phone is required.' }, 400);
  if (!isPlan(plan)) return c.json({ error: 'plan must be trial, monthly, quarterly or annual.' }, 400);

  const account = normalisePhone(phone);
  const existing = await c.env.DB.prepare('SELECT * FROM farms WHERE phone = ?').bind(account).first<FarmRow>();

  const farmName = typeof name === 'string' ? name : (existing?.name ?? '');
  const agentCode = typeof agent === 'string' && agent.trim() ? agent.trim() : (existing?.agent_code ?? null);

  let farm: FarmRow;
  if (existing) {
    await c.env.DB.prepare('UPDATE farms SET name = ?, agent_code = ?, updated_at = ? WHERE id = ?')
      .bind(farmName, agentCode, new Date().toISOString(), existing.id)
      .run();
    farm = { ...existing, name: farmName, agent_code: agentCode };
  } else {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    // A brand-new farm starts with nothing; applyPayment below sets the real expiry.
    await c.env.DB.prepare(
      `INSERT INTO farms (id, phone, name, agent_code, plan, expires_at, activated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, account, farmName, agentCode, plan, todayInNairobi(), now, now)
      .run();
    farm = {
      id,
      phone: account,
      name: farmName,
      agent_code: agentCode,
      plan,
      expires_at: todayInNairobi(),
      activated_at: now,
      updated_at: now,
    };
  }

  const result = await applyPayment(c.env, {
    farm,
    plan,
    amount: typeof amount === 'number' ? amount : PLAN_PRICES[plan],
    mpesaRef: typeof mpesaRef === 'string' ? mpesaRef : null,
    reason: existing ? 'renew' : 'activate',
  });

  return c.json({
    farm: describeFarm(result.farm),
    token: result.token,
    link: `herdcare://activate?token=${result.token}`,
    price: { amount: PLAN_PRICES[plan], currency: PRICE_CURRENCY },
    commission: { commission: result.commission, bounty: result.bounty, note: result.note },
    duplicate: result.duplicate,
  });
});

/**
 * Hands a phone a fresh code. The app's quiet refresh when it has signal.
 *
 * It presents whatever code it currently holds, even an expired one. Holding a code is what proves
 * the request comes from a phone that already has a licence, without a password a farmer would
 * have to remember. The signature is not checked here on purpose: the database is the authority,
 * so a forged code simply finds no farm.
 */
app.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => null);
  const token = typeof (body as any)?.token === 'string' ? (body as any).token : '';

  const payload = readUnverifiedPayload(token);
  if (!payload) return c.json({ error: 'Send the activation code this phone is currently using.' }, 400);

  const farm = await c.env.DB.prepare('SELECT * FROM farms WHERE phone = ?')
    .bind(normalisePhone(payload.acc))
    .first<FarmRow>();

  if (!farm) return c.json({ error: 'No subscription found for this number.' }, 404);

  return c.json({ farm: describeFarm(farm), token: await issueToken(c.env, farm, 'refresh') });
});

app.get('/farms/:phone', requireAdmin, async (c) => {
  const farm = await c.env.DB.prepare('SELECT * FROM farms WHERE phone = ?')
    .bind(normalisePhone(c.req.param('phone')))
    .first<FarmRow>();

  if (!farm) return c.json({ error: 'No subscription found for this number.' }, 404);
  return c.json({ farm: describeFarm(farm) });
});

/** Creates an agent and returns their key once. It is stored hashed and cannot be shown again. */
app.post('/admin/agents', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const { code, name, phone, commissionRate, activationBounty } = (body ?? {}) as Record<string, unknown>;

  if (typeof code !== 'string' || !code.trim()) return c.json({ error: 'code is required.' }, 400);
  if (typeof name !== 'string' || !name.trim()) return c.json({ error: 'name is required.' }, 400);

  const key = randomToken();

  await c.env.DB.prepare(
    `INSERT INTO agents (code, name, phone, api_key_hash, commission_rate, activation_bounty)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       name = excluded.name, phone = excluded.phone, api_key_hash = excluded.api_key_hash,
       commission_rate = excluded.commission_rate, activation_bounty = excluded.activation_bounty`,
  )
    .bind(
      code.trim(),
      name.trim(),
      typeof phone === 'string' ? normalisePhone(phone) : null,
      await sha256Hex(key),
      typeof commissionRate === 'number' ? commissionRate : 0.1,
      typeof activationBounty === 'number' ? activationBounty : 750,
    )
    .run();

  return c.json({
    agent: { code: code.trim(), name: name.trim() },
    apiKey: key,
    warning: 'Give this key to the agent now. It is stored hashed and cannot be shown again.',
  });
});

/** Lists all agents with active farms and commission stats for the admin desk. */
app.get('/admin/agents', requireAdmin, async (c) => {
  const { results: agentsList } = await c.env.DB.prepare(
    `SELECT a.code, a.name, a.phone, a.commission_rate AS commissionRate,
            a.activation_bounty AS activationBounty, a.active, a.created_at AS createdAt,
            COUNT(DISTINCT f.id) AS farms,
            COALESCE(SUM(CASE WHEN p.settled_at IS NULL THEN p.commission + p.bounty ELSE 0 END), 0) AS owed,
            COALESCE(SUM(CASE WHEN p.settled_at IS NOT NULL THEN p.commission + p.bounty ELSE 0 END), 0) AS settled
     FROM agents a
     LEFT JOIN farms f ON f.agent_code = a.code
     LEFT JOIN payments p ON p.agent_code = a.code
     GROUP BY a.code
     ORDER BY a.created_at DESC`,
  ).all();

  return c.json({ agents: agentsList ?? [], currency: PRICE_CURRENCY });
});

/** Marks an agent's outstanding commission as paid out. */
app.post('/admin/agents/:code/settle', requireAdmin, async (c) => {
  const code = c.req.param('code');
  const agent = await c.env.DB.prepare('SELECT * FROM agents WHERE code = ?').bind(code).first<AgentRow>();
  if (!agent) return c.json({ error: 'No such agent.' }, 404);

  const owed = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE agent_code = ? AND settled_at IS NULL',
  )
    .bind(code)
    .first<{ total: number }>();

  const settledAt = new Date().toISOString();
  const result = await c.env.DB.prepare(
    'UPDATE payments SET settled_at = ? WHERE agent_code = ? AND settled_at IS NULL',
  )
    .bind(settledAt, code)
    .run();

  return c.json({ agent: code, settled: owed?.total ?? 0, payments: result.meta.changes, currency: PRICE_CURRENCY, settledAt });
});

app.get('/agents/:code/summary', requireAdmin, async (c) => {
  const code = c.req.param('code');
  const agent = await c.env.DB.prepare('SELECT * FROM agents WHERE code = ?').bind(code).first<AgentRow>();
  if (!agent) return c.json({ error: 'No such agent.' }, 404);

  const farms = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM farms WHERE agent_code = ?')
    .bind(code)
    .first<{ n: number }>();
  const owed = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE agent_code = ? AND settled_at IS NULL',
  )
    .bind(code)
    .first<{ total: number }>();
  const settled = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE agent_code = ? AND settled_at IS NOT NULL',
  )
    .bind(code)
    .first<{ total: number }>();

  return c.json({
    agent: { code: agent.code, name: agent.name, commissionRate: agent.commission_rate, bounty: agent.activation_bounty },
    farms: farms?.n ?? 0,
    currency: PRICE_CURRENCY,
    owed: owed?.total ?? 0,
    settled: settled?.total ?? 0,
  });
});

/** Lets the nightly job be triggered by hand while testing it. */
app.post('/admin/run-reminders', requireAdmin, async (c) => c.json(await sendRenewalNotices(c.env)));


/**
 * Issues a recovery code that an agent reads out to a farmer, instead of an SMS.
 *
 * Recovery needs some channel that is not the lost phone. SMS is the obvious one, but it means an
 * Africa's Talking account, a registered sender ID, and a per-message cost before the first farmer
 * is signed. The agent is a channel you already have, already pay, and who already knows the
 * farmer by sight — which is a stronger check against a SIM swap than an SMS is, not a weaker one.
 *
 * The farmer then types this into the same screen they would use for an SMS code, so the app has
 * one flow regardless of how the code reached them.
 *
 * The trade-off, stated plainly: the agent sees the code, so a dishonest agent could restore that
 * farm's backup onto a handset of their own. `recovery_log` records every one of these.
 */
app.post('/admin/recover', requireAdminOrAgent, async (c) => {
  const body = await c.req.json().catch(() => null);
  const rawPhone = (body as any)?.phone;
  if (typeof rawPhone !== 'string' || !rawPhone.trim()) return c.json({ error: 'phone is required.' }, 400);

  const phone = normalisePhone(rawPhone);
  const farm = await c.env.DB.prepare('SELECT * FROM farms WHERE phone = ?').bind(phone).first<FarmRow>();
  if (!farm) return c.json({ error: 'No subscription found for this number.' }, 404);

  const code = randomOtp();
  // Shorter than an SMS code's life: it is being read out during a conversation, not waiting in
  // an inbox for somebody to come back to their phone.
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO otp_codes (id, phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), phone, await sha256Hex(code), 'agent-recover', expiresAt)
    .run();

  await c.env.DB.prepare('INSERT INTO recovery_log (id, farm_id, phone, outcome, device_id) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), farm.id, phone, 'agent-issued', null)
    .run();

  return c.json({
    code,
    expiresInMinutes: 30,
    farm: { phone: farm.phone, name: farm.name },
    instructions: `Read this code to ${farm.name || 'the farmer'}. On their phone: Settings, then This phone, enter ${phone}, then the code.`,
  });
});

app.notFound((c) => c.json({ error: 'No such endpoint.' }, 404));

app.onError((error, c) => {
  // Never leak a stack trace or a binding name to a caller. The detail goes to `wrangler tail`.
  console.error('Unhandled error', error);
  return c.json({ error: 'Something went wrong.' }, 500);
});

export default {
  fetch: app.fetch,
  /** Cron trigger; see the [triggers] block in wrangler.toml. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      sendRenewalNotices(env)
        .then((summary) => console.log('Renewal notices', JSON.stringify(summary)))
        .catch((error) => console.error('Renewal notices failed', error)),
    );
  },
};
