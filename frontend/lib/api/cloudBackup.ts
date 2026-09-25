import { apiRequest, type ApiResult } from './client';
import { restoreBackup, type BackupBundle, type RestoreSummary } from '@/lib/backup';
import { getCloudAccount, recordCloudRestore } from '@/db/cloudAccount';

/**
 * The older, signed-in online backup, kept only so a farmer who saved one before automatic backup
 * existed can still bring it back onto a new phone. New backups go through lib/cloudSync.ts.
 */

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
  if (!account) return { ok: false, error: 'No saved copy is linked to this phone.' };

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
