import { Hono } from 'hono';
import type { AgentRow, Env } from '../types';
import { normalisePhone } from '../license';
import { referredTrialEndsOn, todayInNairobi } from '../plans';

/**
 * A farmer's phone saying which agent helped them.
 *
 * Sent by the app when the farmer enters an agent's code, or the next time it has signal if they
 * were offline. It is what puts the farmer on that agent's follow-up list during the free trial.
 *
 * Open, with no key, because the only credential a new farmer has is the agent's code. That is
 * safe because a row here is worth nothing to a forger: it pays no commission and grants no access
 * (see migrations/0003). The most it can do is add a name to the list of the agent whose code was
 * used, which that agent can ignore.
 */
export const referrals = new Hono<{ Bindings: Env }>();

const INSTALL_ID = /^[A-Za-z0-9-]{16,64}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** A Safaricom or Airtel mobile number once normalised: 2547xxxxxxxx or 2541xxxxxxxx. */
const KENYAN_MOBILE = /^254[17]\d{8}$/;

referrals.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return c.json({ error: 'Expected a JSON body.' }, 400);

  const { installId, agentCode, phone, name, trialStartedAt } = body;

  if (typeof installId !== 'string' || !INSTALL_ID.test(installId)) {
    return c.json({ error: 'installId is missing or malformed.' }, 400);
  }
  if (typeof agentCode !== 'string' || !agentCode.trim()) {
    return c.json({ error: 'Enter your agent’s code.' }, 400);
  }
  if (typeof phone !== 'string' || !KENYAN_MOBILE.test(normalisePhone(phone))) {
    return c.json({ error: 'Enter your M-Pesa number, for example 0712 345 678.' }, 400);
  }

  const code = agentCode.trim().toUpperCase();
  const agent = await c.env.DB.prepare('SELECT * FROM agents WHERE code = ? AND active = 1')
    .bind(code)
    .first<AgentRow>();
  // 422 rather than 404, so the app can tell "no such agent" apart from "this server is older than
  // the app and has no such endpoint yet", which it should just retry later.
  if (!agent) {
    return c.json({ error: `No agent has the code ${code}. Check it with the person who gave it to you.` }, 422);
  }

  // The phone is the authority on when its own trial began, but only within reason: a start date
  // in the future is a wrong clock, and is taken as today.
  const today = todayInNairobi();
  const started =
    typeof trialStartedAt === 'string' && YMD.test(trialStartedAt) && trialStartedAt <= today ? trialStartedAt : today;
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO referrals (id, install_id, agent_code, phone, name, trial_started_at, trial_ends_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(install_id) DO UPDATE SET
       agent_code = excluded.agent_code, phone = excluded.phone, name = excluded.name,
       trial_started_at = excluded.trial_started_at, trial_ends_at = excluded.trial_ends_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      installId,
      agent.code,
      normalisePhone(phone),
      cleanName,
      started,
      referredTrialEndsOn(started),
      now,
      now,
    )
    .run();

  return c.json({ agent: { code: agent.code, name: agent.name }, trialEndsOn: referredTrialEndsOn(started) });
});
