import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useColors } from '@/theme/colors';
import { BackupFormatError, exportJsonBackup, exportPdfReport, pickBackupFile, restoreBackup, type RestoreSummary } from '@/lib/backup';
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

  async function handleExportPdf() {
    setBusy('pdf');
    setMessage(null);
    try {
      const result = await exportPdfReport();
      notifySaved();
      setMessage(
        result.shared
          ? 'Report created. Send it to yourself on WhatsApp, Drive or email so it survives this phone.'
          : `Report saved as ${result.fileName}.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not create the report.');
    } finally {
      setBusy(null);
    }
  }

  async function handleExportJson() {
    setBusy('json');
    setMessage(null);
    try {
      const result = await exportJsonBackup();
      notifySaved();
      setMessage(
        result.shared
          ? 'Technical backup created. Keep this one too — it is what Restore reads.'
          : `Technical backup saved as ${result.fileName}.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not create the technical backup.');
    } finally {
      setBusy(null);
    }
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
      <Text className="px-1 text-label font-sans-semibold uppercase text-tertiary">Backup</Text>

      <Surface level="raised" className="gap-3 p-4">
        <View className="flex-row items-start gap-3">
          <Ionicons name="save-outline" size={20} color={colors.secondary} />
          <View className="flex-1">
            <Text className="text-body font-sans-medium text-primary">Your records live only on this phone</Text>
            <Text className="text-label text-tertiary">
              Clearing app storage, losing the phone or replacing it would take them with it. A backup is a file you
              keep somewhere else.
            </Text>
          </View>
        </View>

        {stale ? (
          <Callout tone="warn">
            {daysSince === null ? 'You have never backed up your records.' : `Last backup was ${daysSince} days ago.`}
          </Callout>
        ) : lastBackupAt ? (
          <Text className="text-label text-tertiary">
            Last backup {formatDateForDisplay(lastBackupAt)}
            {daysSince === 0 ? ' (today)' : ''}
          </Text>
        ) : null}

        <Button
          label="Back up my records"
          fullWidth
          loading={busy === 'pdf'}
          disabled={busy !== null}
          onPress={handleExportPdf}
          icon={<Ionicons name="share-outline" size={20} color={colors.onBrand} />}
        />
        <Text className="text-label text-tertiary">
          A readable report — every animal and its recent events. Good for sharing with a vet or buyer.
        </Text>
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
          disabled={busy !== null}
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