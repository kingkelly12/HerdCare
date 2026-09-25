import * as Crypto from 'expo-crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cloudInstall, type CloudInstall } from '@/db/schema';
import { getSettings } from '@/db/reminders';
import { getCloudAccount } from '@/db/cloudAccount';
import { loadLicenseStatus } from '@/db/license';
import { apiRequest, isCloudConfigured } from '@/lib/api/client';
import { buildBackup, restoreBackup, type BackupBundle, type RestoreSummary } from '@/lib/backup';

/**
 * Automatic online backup, for every farmer, with nothing to sign in to.
 *
 * The phone makes its own random id and key the first time, then sends a copy of its records
 * whenever they have changed and there is signal: at launch, and when the farmer comes back to the
 * app. It costs nothing on Cloudflare's free tier, so it is not tied to a subscription.
 *
 * The phone's own database stays the source of truth. This is a copy for a lost phone, never
 * something that writes back unless the farmer restores onto a new handset.
 */

const ROW_ID = 'default';

/** The shortest gap between automatic attempts, so returning to the app every minute is free. */
const AUTO_SYNC_GAP_MS = 15 * 60 * 1000;

export type SyncState =
  | { state: 'saved'; savedAt: string; sizeBytes: number }
  /** Nothing has changed since the last copy was saved. */
  | { state: 'unchanged' }
  /** No animals, flocks or money records yet, so there is nothing worth saving. */
  | { state: 'empty' }
  /** No signal, or the server did not answer. It will try again later on its own. */
  | { state: 'offline'; message: string }
  /** This farm's backup was moved to another phone during a recovery. This phone stops saving. */
  | { state: 'moved' }
  | { state: 'failed'; message: string }
  | { state: 'unavailable' };

type Listener = (syncing: boolean) => void;
const listeners = new Set<Listener>();
let inFlight: Promise<SyncState> | null = null;
let lastAutoAttempt = 0;

/** Lets a screen show "Saving…" while a sync started elsewhere is running. */
export function onSyncActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSyncing(): boolean {
  return inFlight !== null;
}

export async function getCloudInstall(): Promise<CloudInstall | null> {
  const rows = await db.select().from(cloudInstall).where(eq(cloudInstall.id, ROW_ID));
  return rows[0] ?? null;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensureInstall(): Promise<CloudInstall> {
  const existing = await getCloudInstall();
  if (existing) return existing;
  const row = { id: ROW_ID, installId: Crypto.randomUUID(), installKey: hex(Crypto.getRandomBytes(32)) };
  await db.insert(cloudInstall).values(row);
  return (await getCloudInstall())!;
}

/**
 * The farmer's number, if the app already knows it: from their licence, their agent link or an
 * earlier sign-in. Never asked for just to back up. It is sent along only so the backup can be
 * found again from a new phone, which still needs a code sent to that number.
 */
export async function knownPhone(): Promise<string | null> {
  const status = await loadLicenseStatus().catch(() => null);
  if (status && 'payload' in status && status.payload.acc) return status.payload.acc;
  const prefs = await getSettings();
  if (prefs?.farmerPhone) return prefs.farmerPhone;
  const account = await getCloudAccount();
  return account?.phone ?? null;
}

/** Everything the farmer has entered, leaving out the one settings row every phone has. */
function recordCount(bundle: BackupBundle): number {
  return Object.entries(bundle.data).reduce(
    (total, [table, rows]) => total + (table !== 'settings' && Array.isArray(rows) ? rows.length : 0),
    0,
  );
}

/** Saves a copy online now if anything has changed. `force` sends it even if nothing has. */
export function syncBackup(options: { force?: boolean } = {}): Promise<SyncState> {
  if (!inFlight) {
    listeners.forEach((listener) => listener(true));
    inFlight = runSync(options.force ?? false).finally(() => {
      inFlight = null;
      listeners.forEach((listener) => listener(false));
    });
  }
  return inFlight;
}

/** The launch and return-to-app trigger: quiet, throttled, and never an error on screen. */
export function autoSyncBackup(): Promise<SyncState> {
  if (Date.now() - lastAutoAttempt < AUTO_SYNC_GAP_MS) return Promise.resolve({ state: 'unchanged' });
  lastAutoAttempt = Date.now();
  return syncBackup().catch((error) => ({ state: 'failed', message: String(error) }) as SyncState);
}

async function runSync(force: boolean): Promise<SyncState> {
  if (!isCloudConfigured()) return { state: 'unavailable' };

  const bundle = await buildBackup();
  const records = recordCount(bundle);
  // An empty farm is never sent. Besides being pointless, it could never be what a farmer wants
  // back on a new phone.
  if (records === 0) return { state: 'empty' };

  const install = await ensureInstall();
  const [phone, prefs] = await Promise.all([knownPhone(), getSettings()]);
  const agentCode = prefs?.agentCode ?? null;

  const data = JSON.stringify(bundle);
  // `exportedAt` changes every time, so it is left out of the fingerprint; the number and agent
  // are put in, so linking an agent or paying re-sends the copy with its new label.
  const fingerprint = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify({ ...bundle, exportedAt: null, phone, agentCode }),
  );
  if (!force && fingerprint === install.lastSyncedHash) return { state: 'unchanged' };

  const result = await apiRequest<{ saved: boolean; sizeBytes: number; savedAt: string }>('/sync', {
    method: 'PUT',
    token: install.installKey,
    body: { installId: install.installId, data, records, phone, agentCode },
    timeoutMs: 60_000,
  });

  if (!result.ok) {
    if (result.status === 401) return { state: 'moved' };
    if (result.offline || result.status === 404 || (result.status ?? 0) >= 500) {
      return { state: 'offline', message: result.error };
    }
    return { state: 'failed', message: result.error };
  }

  await db
    .update(cloudInstall)
    .set({ lastSyncedAt: result.data.savedAt, lastSyncedBytes: result.data.sizeBytes, lastSyncedHash: fingerprint })
    .where(eq(cloudInstall.id, ROW_ID));
  return { state: 'saved', savedAt: result.data.savedAt, sizeBytes: result.data.sizeBytes };
}

/**
 * On a replacement phone: takes over the backup the server handed back after the farmer proved
 * their number, and merges it into this phone. Merge, not replace, so anything already logged on
 * the new phone stays.
 */
export async function restoreFromInstall(install: { id: string; key: string }): Promise<
  { ok: true; summary: RestoreSummary } | { ok: false; error: string }
> {
  const result = await apiRequest<{ data: string }>(`/sync?installId=${encodeURIComponent(install.id)}`, {
    token: install.key,
    timeoutMs: 60_000,
  });
  if (!result.ok) return { ok: false, error: result.error };

  let bundle: BackupBundle;
  try {
    bundle = JSON.parse(result.data.data) as BackupBundle;
  } catch {
    return { ok: false, error: 'The saved copy could not be read.' };
  }

  const summary = await restoreBackup(bundle);

  // This phone now owns that backup and keeps saving to it. The fingerprint is cleared so the
  // merged records, which may include things logged here first, go up at the next sync.
  await db.delete(cloudInstall).where(eq(cloudInstall.id, ROW_ID));
  await db.insert(cloudInstall).values({ id: ROW_ID, installId: install.id, installKey: install.key });
  return { ok: true, summary };
}
