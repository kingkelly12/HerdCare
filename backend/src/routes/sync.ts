import { Hono } from 'hono';
import type { Env } from '../types';
import { secretsMatch, sha256Hex } from '../crypto';
import { normalisePhone } from '../license';
import { MAX_BACKUP_BYTES, gunzipFromBase64, gzipToBase64 } from './backup';

/**
 * Online backup for every install, with nothing to sign in to.
 *
 * The app makes a random id and secret key for itself the first time it backs up, and every backup
 * after that is sent under them. There is no account and no phone number to prove, so a farmer on
 * their free trial is backed up from their first day, at no cost to anybody: one small row in D1.
 *
 * Getting the backup back onto a *different* phone is the part that needs proof, and that lives
 * in routes/auth.ts: a code sent to, or read out to, the number this install reported.
 *
 * Like routes/backup.ts, the Worker never looks inside the payload.
 */
export const sync = new Hono<{ Bindings: Env }>();

const INSTALL_ID = /^[A-Za-z0-9-]{16,64}$/;
const KENYAN_MOBILE = /^254[17]\d{8}$/;

function bearer(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

type Access = { ok: true; exists: boolean } | { ok: false; status: 400 | 401; error: string };

/** Checks the key against the install. An id nobody has used yet is free to claim. */
async function access(env: Env, installId: unknown, key: string | undefined): Promise<Access> {
  if (typeof installId !== 'string' || !INSTALL_ID.test(installId)) {
    return { ok: false, status: 400, error: 'installId is missing or malformed.' };
  }
  if (!key || key.length < 32) return { ok: false, status: 401, error: 'Missing backup key.' };

  const row = await env.DB.prepare('SELECT key_hash FROM installs WHERE id = ?').bind(installId).first<{ key_hash: string }>();
  if (!row) return { ok: true, exists: false };
  if (!secretsMatch(await sha256Hex(key), row.key_hash)) {
    // Also what an old phone sees after its backup was moved to a new one during a recovery.
    return { ok: false, status: 401, error: 'This phone’s backup has moved to another phone.' };
  }
  return { ok: true, exists: true };
}

sync.put('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: 'Expected a JSON body.' }, 400);

  const key = bearer(c.req.header('authorization'));
  const check = await access(c.env, body.installId, key);
  if (!check.ok) return c.json({ error: check.error }, check.status);
  const installId = body.installId as string;

  const payload = body.data;
  if (payload === undefined || payload === null) return c.json({ error: 'Nothing to back up.' }, 400);
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const sizeBytes = new TextEncoder().encode(text).length;
  if (sizeBytes > MAX_BACKUP_BYTES) {
    return c.json({ error: 'That backup is too large.', maxBytes: MAX_BACKUP_BYTES }, 413);
  }

  const phone =
    typeof body.phone === 'string' && KENYAN_MOBILE.test(normalisePhone(body.phone)) ? normalisePhone(body.phone) : null;
  const agentCode =
    typeof body.agentCode === 'string' && body.agentCode.trim() ? body.agentCode.trim().toUpperCase().slice(0, 32) : null;
  const records = Number(body.records ?? 0);
  const now = new Date().toISOString();

  if (!check.exists) {
    await c.env.DB.prepare('INSERT INTO installs (id, key_hash, phone, agent_code, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .bind(installId, await sha256Hex(key!), phone, agentCode, now)
      .run();
  } else {
    await c.env.DB.prepare('UPDATE installs SET phone = COALESCE(?, phone), agent_code = COALESCE(?, agent_code), last_seen_at = ? WHERE id = ?')
      .bind(phone, agentCode, now, installId)
      .run();
  }

  await c.env.DB.prepare(
    `INSERT INTO install_backups (install_id, payload, size_bytes, record_count, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(install_id) DO UPDATE SET
       payload = excluded.payload, size_bytes = excluded.size_bytes,
       record_count = excluded.record_count, updated_at = excluded.updated_at`,
  )
    .bind(installId, await gzipToBase64(text), sizeBytes, Number.isFinite(records) ? records : 0, now)
    .run();

  return c.json({ saved: true, sizeBytes, savedAt: now });
});

sync.get('/', async (c) => {
  const installId = c.req.query('installId');
  const check = await access(c.env, installId, bearer(c.req.header('authorization')));
  if (!check.ok) return c.json({ error: check.error }, check.status);
  if (!check.exists) return c.json({ error: 'Nothing has been backed up from this phone yet.' }, 404);

  const row = await c.env.DB.prepare('SELECT payload, size_bytes, record_count, updated_at FROM install_backups WHERE install_id = ?')
    .bind(installId)
    .first<{ payload: string; size_bytes: number; record_count: number; updated_at: string }>();
  if (!row) return c.json({ error: 'Nothing has been backed up from this phone yet.' }, 404);

  return c.json({
    data: await gunzipFromBase64(row.payload),
    sizeBytes: row.size_bytes,
    records: row.record_count,
    savedAt: row.updated_at,
  });
});
