import { Hono } from 'hono';
import type { AgentRow, Env } from '../types';
import { secretsMatch, sha256Hex, randomToken } from '../crypto';
import { normalisePhone } from '../license';
import { PRICE_CURRENCY } from '../plans';
import { describeFarm } from '../subscription';
import type { FarmRow } from '../types';

/**
 * What an agent can see about their own book, without an admin token.
 * Admins holding ADMIN_TOKEN can also inspect any agent's view via ?code= or view Master Overview.
 */

export const agents = new Hono<{ Bindings: Env }>();

interface AuthContext {
  isAdmin: boolean;
  agent?: AgentRow;
  targetCode?: string;
}

async function resolveAuth(env: Env, header: string | undefined, queryCode?: string): Promise<AuthContext | null> {
  const key = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!key) return null;

  if (env.ADMIN_TOKEN && secretsMatch(key, env.ADMIN_TOKEN)) {
    if (queryCode && queryCode !== 'ALL') {
      const agent = await env.DB.prepare('SELECT * FROM agents WHERE code = ?')
        .bind(queryCode)
        .first<AgentRow>();
      return { isAdmin: true, agent: agent ?? undefined, targetCode: queryCode };
    }
    return { isAdmin: true, targetCode: queryCode || 'ALL' };
  }

  const agent = await env.DB.prepare('SELECT * FROM agents WHERE api_key_hash = ? AND active = 1')
    .bind(await sha256Hex(key))
    .first<AgentRow>();

  if (!agent) return null;
  return { isAdmin: false, agent, targetCode: agent.code };
}

agents.get('/me', async (c) => {
  const queryCode = c.req.query('code')?.trim();
  const auth = await resolveAuth(c.env, c.req.header('authorization'), queryCode);
  if (!auth) return c.json({ error: 'Not authorised.' }, 401);

  if (auth.isAdmin && (!auth.targetCode || auth.targetCode === 'ALL')) {
    const farms = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM farms').first<{ n: number }>();
    const owed = await c.env.DB.prepare(
      'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE settled_at IS NULL',
    ).first<{ total: number }>();
    const settled = await c.env.DB.prepare(
      'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE settled_at IS NOT NULL',
    ).first<{ total: number }>();

    return c.json({
      agent: { code: 'ALL', name: 'Master Overview' },
      farms: farms?.n ?? 0,
      currency: PRICE_CURRENCY,
      owed: owed?.total ?? 0,
      settled: settled?.total ?? 0,
    });
  }

  const agentCode = auth.agent?.code ?? auth.targetCode ?? '';
  const agentName = auth.agent?.name ?? (agentCode || 'Agent');

  const farms = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM farms WHERE agent_code = ?')
    .bind(agentCode)
    .first<{ n: number }>();

  const owed = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE agent_code = ? AND settled_at IS NULL',
  )
    .bind(agentCode)
    .first<{ total: number }>();

  const settled = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(commission + bounty), 0) AS total FROM payments WHERE agent_code = ? AND settled_at IS NOT NULL',
  )
    .bind(agentCode)
    .first<{ total: number }>();

  return c.json({
    agent: { code: agentCode, name: agentName },
    farms: farms?.n ?? 0,
    currency: PRICE_CURRENCY,
    owed: owed?.total ?? 0,
    settled: settled?.total ?? 0,
  });
});

/** The agent's farms, soonest to lapse first, because that is the list they should work from. */
agents.get('/me/farms', async (c) => {
  const queryCode = c.req.query('code')?.trim();
  const auth = await resolveAuth(c.env, c.req.header('authorization'), queryCode);
  if (!auth) return c.json({ error: 'Not authorised.' }, 401);

  if (auth.isAdmin && (!auth.targetCode || auth.targetCode === 'ALL')) {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM farms ORDER BY expires_at ASC LIMIT 300',
    ).all<FarmRow>();
    return c.json({ farms: (results ?? []).map((farm) => describeFarm(farm)) });
  }

  const agentCode = auth.agent?.code ?? auth.targetCode ?? '';
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM farms WHERE agent_code = ? ORDER BY expires_at ASC LIMIT 200',
  )
    .bind(agentCode)
    .all<FarmRow>();

  return c.json({ farms: (results ?? []).map((farm) => describeFarm(farm)) });
});

/** Every payment they have earned on, newest first. */
agents.get('/me/earnings', async (c) => {
  const queryCode = c.req.query('code')?.trim();
  const auth = await resolveAuth(c.env, c.req.header('authorization'), queryCode);
  if (!auth) return c.json({ error: 'Not authorised.' }, 401);

  if (auth.isAdmin && (!auth.targetCode || auth.targetCode === 'ALL')) {
    const { results } = await c.env.DB.prepare(
      `SELECT p.paid_at, p.plan, p.amount, p.commission, p.bounty, p.settled_at, f.phone, f.name
       FROM payments p JOIN farms f ON f.id = p.farm_id
       ORDER BY p.created_at DESC LIMIT 200`,
    ).all();
    return c.json({ currency: PRICE_CURRENCY, earnings: results ?? [] });
  }

  const agentCode = auth.agent?.code ?? auth.targetCode ?? '';
  const { results } = await c.env.DB.prepare(
    `SELECT p.paid_at, p.plan, p.amount, p.commission, p.bounty, p.settled_at, f.phone, f.name
     FROM payments p JOIN farms f ON f.id = p.farm_id
     WHERE p.agent_code = ? ORDER BY p.created_at DESC LIMIT 100`,
  )
    .bind(agentCode)
    .all();

  return c.json({ currency: PRICE_CURRENCY, earnings: results ?? [] });
});

/**
 * Self-service registration for farmers becoming community agents.
 * Generates an agent code, provisions an API key, and returns the credentials.
 */
agents.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid request body.' }, 400);

  const rawName = (body as Record<string, unknown>).name;
  const rawPhone = (body as Record<string, unknown>).phone;

  if (typeof rawName !== 'string' || !rawName.trim()) {
    return c.json({ error: 'Name is required.' }, 400);
  }
  if (typeof rawPhone !== 'string' || !rawPhone.trim()) {
    return c.json({ error: 'Phone number is required.' }, 400);
  }

  const name = rawName.trim();
  let phone: string;
  try {
    phone = normalisePhone(rawPhone);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid Kenyan phone number.';
    return c.json({ error: msg }, 400);
  }

  // Check if an agent is already registered under this phone number
  const existing = await c.env.DB.prepare('SELECT * FROM agents WHERE phone = ?')
    .bind(phone)
    .first<AgentRow>();

  const apiKey = randomToken();
  const apiKeyHash = await sha256Hex(apiKey);

  if (existing) {
    // Never issue a key for a number that is already registered. This endpoint is public and a
    // phone number is not a secret, so handing a fresh key to whoever asks would let anyone take
    // over an agent's account just by knowing their number — and with it the agent's farms, their
    // earnings, and the ability to issue recovery codes. An agent who has lost their key gets a
    // new one from the admin, who can see who they are.
    return c.json(
      {
        error: 'This number is already registered as an agent. Ask the HerdCare admin to reissue your agent key.',
        isExisting: true,
      },
      409,
    );
  }

  // Generate a clean, human-friendly code: up to 4 uppercase characters from name + 3 digits
  const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) || 'AGT';

  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const num = Math.floor(100 + Math.random() * 900);
    const candidate = `${letters}-${num}`;
    const found = await c.env.DB.prepare('SELECT code FROM agents WHERE code = ?')
      .bind(candidate)
      .first();
    if (!found) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    code = `${letters}-${Date.now().toString().slice(-4)}`;
  }

  await c.env.DB.prepare(
    `INSERT INTO agents (code, name, phone, api_key_hash, commission_rate, activation_bounty, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(code, name, phone, apiKeyHash, 0.10, 750)
    .run();

  return c.json({
    agent: {
      code,
      name,
      phone,
      commissionRate: 0.10,
      activationBounty: 750,
    },
    apiKey,
    isExisting: false,
  });
});

