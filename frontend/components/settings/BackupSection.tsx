import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useColors } from '@/theme/colors';
import {
  BackupFormatError,
  exportJsonBackup,
  exportPdfReport,
  pickBackupFile,
  restoreBackup,
  shareFile,
  type ExportResult,
  type RestoreSummary,
} from '@/lib/backup';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';
import { notifySaved } from '@/lib/haptics';
import { daysFromToday, formatDateForDisplay } from '@/utils/livestockRules';

function summarise(summary: RestoreSummary): string {
  const added = Object.values(summary.added).reduce((total, n) => total + n, 0);
  if (added === 0 && summary.updated === 0) return 'Everything in that backup was already on this phone.';
  const parts: string[] = [];
  if (summary.added.animals) parts.push(`${summary.added.animals} animals`);
  const events = summary.added.breedingEvents + summary.added.birthRecords + summary.added.healthLogs;
  if (events) parts.push(`${events} records`);
  if (summary.added.milkRecords) parts.push(`${summary.added.milkRecords} milkings`);
  const money = summary.added.expenses + summary.added.incomeEntries;
  if (money) parts.push(`${money} money entries`);
  if (summary.added.flocks) parts.push(`${summary.added.flocks} flocks`);
  if (summary.added.reminderSchedules) parts.push(`${summary.added.reminderSchedules} repeating tasks`);
  if (summary.updated) parts.push(`${summary.updated} updated`);
  return `Restored ${parts.join(', ')}.`;
}

export function BackupSection({ lastBackupAt, hasRecords }: { lastBackupAt: string | null; hasRecords: boolean }) {
  const colors = useColors();
  const [busy, setBusy] = useState<'pdf' | 'json' | 'restore' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const daysSince = lastBackupAt ? Math.abs(daysFromToday(lastBackupAt) ?? 0) : null;
  const stale = hasRecords && (daysSince === null || daysSince >= 30);

  /**
   * Makes the file, stops the spinner, then opens the share window. The spinner covers only the
   * part that is actually work; what the farmer does in the share window takes as long as it takes.
   */
  async function makeAndShare(kind: 'pdf' | 'json', make: () => Promise<ExportResult>, done: string) {
    setBusy(kind);
    setMessage(null);
    let file: ExportResult;
    try {
      file = await make();
    } catch (e) {
      setBusy(null);
      setMessage(e instanceof Error ? e.message : 'Could not make the file. Try again.');
      return;
    }
    setBusy(null);
    notifySaved();
    setMessage(done);
    shareFile(file).catch((e) => {
      const text = e instanceof Error ? e.message : '';
      setMessage(
        /another share/i.test(text)
          ? 'A sharing window is still open. Close it, then try again.'
          : `Saved as ${file.fileName}, but the sharing window did not open.`,
      );
    });
  }

  function handleExportPdf() {
    makeAndShare('pdf', exportPdfReport, 'Report ready. Send it to yourself on WhatsApp, Drive or email so it survives this phone.');
  }

  function handleExportJson() {
    makeAndShare('json', exportJsonBackup, 'Technical backup ready. Keep this one too, because it is the file Restore reads.');
  }

  async function handleRestore() {
    setBusy('restore');
    setMessage(null);
    try {
      const picked = await pickBackupFile();
      if (!picked) return;

      const counts = Object.entries(picked.bundle.counts)
        .filter(([, n]) => n > 0)
        .map(([key, n]) => `${n} ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
        .join(', ');

      Alert.alert(
        'Restore this backup?',
        `Made ${formatDateForDisplay(picked.bundle.exportedAt)}\n\n${counts || 'No records'}\n\nAnything already on this phone is kept — this only adds what is missing.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: async () => {
              try {
                const summary = await restoreBackup(picked.bundle);
                await refreshRemindersAndNotifications();
                notifySaved();
                setMessage(summarise(summary));
              } catch (e) {
                setMessage(e instanceof Error ? e.message : 'Could not restore that backup.');
              }
            },
          },
        ],
      );
    } catch (e) {
      setMessage(e instanceof BackupFormatError ? e.message : 'Could not open that file.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="gap-2">
      <Text className="px-1 text-label font-sans-semibold uppercase text-tertiary">Backup files</Text>

      <Surface level="raised" className="gap-3 p-4">
        <View className="flex-row items-start gap-3">
          <Ionicons name="save-outline" size={20} color={colors.secondary} />
          <View className="flex-1">
            <Text className="text-body font-sans-medium text-primary">A copy you keep yourself</Text>
            <Text className="text-label text-tertiary">
              A file you save to WhatsApp, Drive or a memory card. Useful alongside online backup, and it works
              with no internet at all.
            </Text>
          </View>
        </View>

        {stale ? (
          <Callout tone="warn">
            {daysSince === null ? 'You have not saved a backup file yet.' : `Last backup file was ${daysSince} days ago.`}
          </Callout>
        ) : lastBackupAt ? (
          <Text className="text-label text-tertiary">
            Last backup {formatDateForDisplay(lastBackupAt)}
            {daysSince === 0 ? ' (today)' : ''}
          </Text>
        ) : null}

        {hasRecords ? (
          <>
            <Button
              label="Back up my records"
              fullWidth
              loading={busy === 'pdf'}
              disabled={busy !== null}
              onPress={handleExportPdf}
              icon={<Ionicons name="share-outline" size={20} color={colors.onBrand} />}
            />
            <Text className="text-label text-tertiary">
              A readable report of every animal and its recent events. Good for sharing with a vet or buyer.
            </Text>
          </>
        ) : (
          <Text className="text-callout text-secondary">
            Nothing to back up yet. Once you add your first animal or flock, this makes a report you can
            send to WhatsApp, Drive or email.
          </Text>
        )}
      </Surface>

      <Surface level="raised" className="gap-3 p-4">
        <View className="flex-row items-start gap-3">
          <Ionicons name="code-slash-outline" size={20} color={colors.secondary} />
          <View className="flex-1">
            <Text className="text-body font-sans-medium text-primary">Restoring on another phone</Text>
            <Text className="text-label text-tertiary">
              The report above is for reading, not restoring. Keep a technical backup too — it is the file "Restore"
              actually reads.
            </Text>
          </View>
        </View>

        <Button
          label="Save technical backup"
          variant="secondary"
          fullWidth
          loading={busy === 'json'}
          disabled={busy !== null || !hasRecords}
          onPress={handleExportJson}
        />
        <Button
          label="Restore from a backup"
          variant="ghost"
          fullWidth
          loading={busy === 'restore'}
          disabled={busy !== null}
          onPress={handleRestore}
        />
      </Surface>

      {message ? <Text className="px-1 text-label text-secondary">{message}</Text> : null}
    </View>
  );
}