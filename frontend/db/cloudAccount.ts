import { eq } from 'drizzle-orm';
import { db } from './client';
import { cloudAccount, type CloudAccount } from './schema';

/** This phone's link to the cloud service, or null if the farmer has never signed in. */

const ROW_ID = 'default';

export async function getCloudAccount(): Promise<CloudAccount | null> {
  const rows = await db.select().from(cloudAccount).where(eq(cloudAccount.id, ROW_ID));
  return rows[0] ?? null;
}

export async function saveCloudAccount(phone: string, deviceToken: string): Promise<void> {
  const existing = await getCloudAccount();
  const now = new Date().toISOString();

  if (existing) {
    // Signing in again, possibly as a different number, replaces the link wholesale. Keeping the
    // old backup timestamps would claim this phone had backed up an account it had not.
    await db
      .update(cloudAccount)
      .set({ phone, deviceToken, signedInAt: now, lastBackupAt: null, lastBackupBytes: null })
      .where(eq(cloudAccount.id, ROW_ID));
  } else {
    await db.insert(cloudAccount).values({ id: ROW_ID, phone, deviceToken, signedInAt: now });
  }
}

export async function recordCloudBackup(sizeBytes: number): Promise<void> {
  await db
    .update(cloudAccount)
    .set({ lastBackupAt: new Date().toISOString(), lastBackupBytes: sizeBytes })
    .where(eq(cloudAccount.id, ROW_ID));
}

export async function recordCloudRestore(): Promise<void> {
  await db.update(cloudAccount).set({ lastRestoreAt: new Date().toISOString() }).where(eq(cloudAccount.id, ROW_ID));
}

/** Used when the server says the token is no longer good, so the app stops pretending it is. */
export async function clearCloudAccount(): Promise<void> {
  await db.delete(cloudAccount).where(eq(cloudAccount.id, ROW_ID));
}
