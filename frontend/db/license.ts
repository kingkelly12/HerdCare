import { eq } from 'drizzle-orm';
import { db } from './client';
import { licenses } from './schema';
import { LICENSE_PUBLIC_KEY } from '@/lib/license/publicKey';
import {
  effectiveToday,
  readLicenseStatus,
  readTrialStatus,
  todayYmd,
  type LicenseStatus,
} from '@/lib/license/status';
import { getSettings, updateSettings } from './reminders';
import { verifyLicense } from '@/lib/license/token';

const ROW_ID = 'default';

async function readRow() {
  const rows = await db.select().from(licenses).where(eq(licenses.id, ROW_ID));
  return rows[0] ?? null;
}

/**
 * Reads the stored licence and works out where it stands today.
 *
 * Also advances the clock high-water mark, which is why this writes on a read: the mark is only
 * useful if it keeps up with time actually passing, and every launch passes through here.
 */
export async function loadLicenseStatus(): Promise<LicenseStatus> {
  const row = await readRow();
  const deviceToday = todayYmd();

  // A paid or owner licence always wins over the trial. Somebody who paid part way through their
  // free month keeps what they bought rather than being held to the trial's end date.
  if (row) {
    const today = effectiveToday(deviceToday, row.clockHighWater);

    if (today !== row.clockHighWater) {
      await db.update(licenses).set({ clockHighWater: today }).where(eq(licenses.id, ROW_ID));
    }

    const paid = readLicenseStatus(row.token, LICENSE_PUBLIC_KEY, today);
    // A lapsed subscription does not fall back to a fresh trial; the trial was already spent.
    if (paid.state !== 'invalid') return paid;
  }

  return startOrReadTrial(deviceToday);
}

/**
 * Reads the free month, starting it if this is the first launch.
 *
 * Starting it here rather than behind a button is the point: a new farmer should be able to log a
 * calving without being shown a price, asked for a code, or introduced to an agent. The bill comes
 * up a month later, once the app has earned the conversation.
 */
async function startOrReadTrial(today: string): Promise<LicenseStatus> {
  const prefs = await getSettings();
  const hasReferral = Boolean(prefs?.agentCode && prefs.agentCode.trim().length > 0);

  if (!prefs?.trialStartedAt) {
    await updateSettings({ trialStartedAt: today });
    return readTrialStatus(today, today, hasReferral);
  }

  return readTrialStatus(prefs.trialStartedAt, today, hasReferral);
}

export type ActivationResult = { ok: true; status: LicenseStatus } | { ok: false; reason: string };

/**
 * Stores a token after checking it, replacing whatever was there before.
 *
 * A renewal is the same operation as a first activation — the farmer is handed a fresh code
 * covering a later date and it lands in the same single row.
 */
export async function activateLicense(token: string): Promise<ActivationResult> {
  const verified = verifyLicense(token, LICENSE_PUBLIC_KEY);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  const row = await readRow();
  // Never let the mark move backwards, including via a code issued on a machine with a slow clock.
  const highWater = effectiveToday(todayYmd(), row?.clockHighWater);

  if (row) {
    await db
      .update(licenses)
      .set({ token: verified.token, clockHighWater: highWater, activatedAt: new Date().toISOString() })
      .where(eq(licenses.id, ROW_ID));
  } else {
    await db.insert(licenses).values({ id: ROW_ID, token: verified.token, clockHighWater: highWater });
  }

  return { ok: true, status: await loadLicenseStatus() };
}

/** Only used by the demo reset in Settings — never reachable in a farmer's normal use. */
export async function clearLicense(): Promise<void> {
  await db.delete(licenses).where(eq(licenses.id, ROW_ID));
}
