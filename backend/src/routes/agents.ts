import { Hono } from 'hono';
import type { AgentRow, Env } from '../types';
import { sha256Hex } from '../crypto';
import { PRICE_CURRENCY } from '../plans';
import { describeFarm } from '../subscription';
import type { FarmRow } from '../types';

/**
 * What an agent can see about their own book, without an admin token.
 *
 * An agent who cannot check their own tally has to ask, and an agent who has to ask stops trusting
 * the number. Keys are stored hashed, so this table leaking does not let anyone impersonate them.
 */

export const agents = new Hono<{ Bindings: Env }>();

async function agentForKey(env: Env, header: string | undefined): Promise<AgentRow | null> {
  const key = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!key) return null;

  return env.DB.prepare('SELECT * FROM agents WHERE api_key_hash = ? AND active = 1')
    .bind(await sha256Hex(key))
    .first<AgentRow>();
}

agents.get('/me', async (c) => {
  const agent = await agentForKey(c.env, c.req.header('authorization'));
  if (!agent) return c.json({ error: 'Not authorised.' }, 401);

  const farms = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM farms WHERE agent_code = ?')
    .bind(agent.code)
    .first<{ n: number }>();

  const owed = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE agent_code = ? AND settled_at IS NULL',
  )
    .bind(agent.code)
    .first<{ total: number }>();

  const settled = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE agent_code = ? AND settled_at IS NOT NULL',
  )
    .bind(agent.code)
    .first<{ total: number }>();

  return c.json({
    agent: { code: agent.code, name: agent.name },
    farms: farms?.n ?? 0,
    currency: PRICE_CURRENCY,
    owed: owed?.total ?? 0,
    settled: settled?.total ?? 0,
  });
});

/** The agent's farms, soonest to lapse first, because that is the list they should work from. */
agents.get('/me/farms', async (c) => {
  const agent = await agentForKey(c.env, c.req.header('authorization'));
  if (!agent) return c.json({ error: 'Not authorised.' }, 401);

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM farms WHERE agent_code = ? ORDER BY expires_at ASC LIMIT 200',
  )
    .bind(agent.code)
    .all<FarmRow>();

  return c.json({ farms: (results ?? []).map((farm) => describeFarm(farm)) });
});

/** Every payment they have earned on, newest first. */
agents.get('/me/earnings', async (c) => {
  const agent = await agentForKey(c.env, c.req.header('authorization'));
  if (!agent) return c.json({ error: 'Not authorised.' }, 401);

  const { results } = await c.env.DB.prepare(
    `SELECT p.paid_at, p.plan, p.amount, p.commission, p.bounty, p.settled_at, f.phone, f.name
     FROM payments p JOIN farms f ON f.id = p.farm_id
     WHERE p.agent_code = ? ORDER BY p.created_at DESC LIMIT 100`,
  )
    .bind(agent.code)
    .all();

  return c.json({ currency: PRICE_CURRENCY, earnings: results ?? [] });
});
