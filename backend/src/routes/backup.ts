import { Hono } from 'hono';
import type { Env } from '../types';
import { farmForDeviceToken } from './auth';

/**
 * Cloud backup: the safety net behind a lost phone, and the feature that cannot be pirated.
 *
 * Deliberately one blob per farm rather than a synced schema. The app is offline-first and its
 * local database is the source of truth; this is a copy taken when there is signal, not a second
 * authority that could disagree with the phone. Modelling it as sync would mean conflict
 * resolution, and a farmer who logs a calving twice because two devices disagreed is worse off
 * than one who has no backup at all.
 *
 * The Worker never looks inside the payload. It arrives as JSON, is gzipped, and is handed back
 * byte for byte.
 */

/** Generous for a smallholder's whole history, small enough that nothing runs away. */
const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

export const backup = new Hono<{ Bindings: Env }>();

function bearer(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

async function gzipToBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());

  // Chunked so a large backup cannot blow the argument limit on String.fromCharCode.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function gunzipFromBase64(encoded: string): Promise<string> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

backup.put('/', async (c) => {
  const session = await farmForDeviceToken(c.env, bearer(c.req.header('authorization')));
  if (!session) return c.json({ error: 'Sign in on this phone first.' }, 401);

  const body = await c.req.json().catch(() => null);
  const payload = (body as any)?.data;
  const recordCount = Number((body as any)?.records ?? 0);

  if (payload === undefined || payload === null) {
    return c.json({ error: 'Nothing to back up.' }, 400);
  }

  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const sizeBytes = new TextEncoder().encode(text).length;

  if (sizeBytes > MAX_BACKUP_BYTES) {
    return c.json({ error: 'That backup is too large.', maxBytes: MAX_BACKUP_BYTES }, 413);
  }

  const compressed = await gzipToBase64(text);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO backups (farm_id, payload, size_bytes, record_count, device_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(farm_id) DO UPDATE SET
       payload = excluded.payload,
       size_bytes = excluded.size_bytes,
       record_count = excluded.record_count,
       device_id = excluded.device_id,
       updated_at = excluded.updated_at`,
  )
    .bind(session.farm.id, compressed, sizeBytes, Number.isFinite(recordCount) ? recordCount : 0, session.deviceId, now, now)
    .run();

  return c.json({
    saved: true,
    sizeBytes,
    storedBytes: compressed.length,
    records: Number.isFinite(recordCount) ? recordCount : 0,
    savedAt: now,
  });
});

backup.get('/', async (c) => {
  const session = await farmForDeviceToken(c.env, bearer(c.req.header('authorization')));
  if (!session) return c.json({ error: 'Sign in on this phone first.' }, 401);

  const row = await c.env.DB.prepare('SELECT * FROM backups WHERE farm_id = ?')
    .bind(session.farm.id)
    .first<{ payload: string; size_bytes: number; record_count: number; updated_at: string }>();

  if (!row) return c.json({ error: 'No backup has been saved for this farm yet.' }, 404);

  return c.json({
    data: await gunzipFromBase64(row.payload),
    sizeBytes: row.size_bytes,
    records: row.record_count,
    savedAt: row.updated_at,
  });
});

/** What is stored, without pulling the whole thing down. Drives the "last backed up" line. */
backup.get('/status', async (c) => {
  const session = await farmForDeviceToken(c.env, bearer(c.req.header('authorization')));
  if (!session) return c.json({ error: 'Sign in on this phone first.' }, 401);

  const row = await c.env.DB.prepare(
    'SELECT size_bytes, record_count, updated_at FROM backups WHERE farm_id = ?',
  )
    .bind(session.farm.id)
    .first<{ size_bytes: number; record_count: number; updated_at: string }>();

  return c.json(
    row
      ? { available: true, sizeBytes: row.size_bytes, records: row.record_count, savedAt: row.updated_at }
      : { available: false },
  );
});
