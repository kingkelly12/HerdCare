import { apiRequest, type ApiResult } from './client';
import { buildBackup, restoreBackup, type BackupBundle, type RestoreSummary } from '@/lib/backup';
import { getCloudAccount, recordCloudBackup, recordCloudRestore } from '@/db/cloudAccount';

/**
 * Keeping a copy of a farmer's records off the phone.
 *
 * Reuses the same bundle the file export already produces, so there is one definition of what a
 * backup is and one restore path. The cloud copy is a safety net behind a lost handset, not a
 * second source of truth: the phone's database is authoritative, and this never writes to it
 * except when the farmer explicitly asks to restore.
 */

export interface CloudBackupStatus {
  available: boolean;
  sizeBytes?: number;
  records?: number;
  savedAt?: string;
}

function countRecords(bundle: BackupBundle): number {
  return Object.values(bundle.data).reduce(
    (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
}

export async function uploadBackup(): Promise<ApiResult<{ sizeBytes: number; savedAt: string }>> {
  const account = await getCloudAccount();
  if (!account) return { ok: false, error: 'Sign in with your M-Pesa number first.' };

  const bundle = await buildBackup();

  const result = await apiRequest<{ saved: boolean; sizeBytes: number; savedAt: string }>('/backup', {
    method: 'PUT',
    token: account.deviceToken,
    body: { data: JSON.stringify(bundle), records: countRecords(bundle) },
    // A whole farm's history over a rural connection deserves longer than a normal request.
    timeoutMs: 60_000,
  });

  if (!result.ok) return result;

  await recordCloudBackup(result.data.sizeBytes);
  return { ok: true, data: { sizeBytes: result.data.sizeBytes, savedAt: result.data.savedAt } };
}

export async function cloudBackupStatus(): Promise<ApiResult<CloudBackupStatus>> {
  const account = await getCloudAccount();
  if (!account) return { ok: false, error: 'Sign in with your M-Pesa number first.' };

  return apiRequest<CloudBackupStatus>('/backup/status', { token: account.deviceToken });
}

/**
 * Pulls the stored copy down and merges it in.
 *
 * Merge, not replace — `restoreBackup` matches on the ids the phone generated, so restoring onto a
 * phone that already has records adds what is missing rather than wiping what is there. That
 * matters most in the case this exists for: a farmer who logged a week of milkings on a new phone
 * before remembering they had a backup.
 */
export async function downloadBackup(): Promise<ApiResult<RestoreSummary>> {
  const account = await getCloudAccount();
  if (!account) return { ok: false, error: 'Sign in with your M-Pesa number first.' };

  const result = await apiRequest<{ data: string; savedAt: string }>('/backup', {
    token: account.deviceToken,
    timeoutMs: 60_000,
  });

  if (!result.ok) return result;

  let bundle: BackupBundle;
  try {
    bundle = JSON.parse(result.data.data) as BackupBundle;
  } catch {
    return { ok: false, error: 'The stored backup could not be read.' };
  }

  const summary = await restoreBackup(bundle);
  await recordCloudRestore();
  return { ok: true, data: summary };
}
