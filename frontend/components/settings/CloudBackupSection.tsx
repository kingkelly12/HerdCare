import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useColors } from '@/theme/colors';
import { isCloudConfigured } from '@/lib/api/client';
import { updateSettings } from '@/db/reminders';
import { getCloudInstall, isSyncing, knownPhone, onSyncActivity, syncBackup, type SyncState } from '@/lib/cloudSync';
import { formatKenyanMobile, normaliseKenyanMobile } from '@/lib/referral';

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Online backup: on by itself, free, and nothing to sign in to.
 *
 * The card only reports what is happening and offers "Back up now" for peace of mind. The one
 * optional thing it may ask for is a phone number, and only when the app does not already know
 * it, because that number is how the farmer finds these records again on a new phone.
 */
export function CloudBackupSection({ hasRecords }: { hasRecords: boolean }) {
  const colors = useColors();
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(isSyncing());
  const [outcome, setOutcome] = useState<SyncState | null>(null);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getCloudInstall()
      .then((row) => setLastSavedAt(row?.lastSyncedAt ?? null))
      .catch(() => {});
    knownPhone()
      .then(setPhone)
      .catch(() => {});
  }, []);

  useFocusEffect(reload);

  // A sync started at launch or on returning to the app shows here as it happens.
  useEffect(
    () =>
      onSyncActivity((active) => {
        setSyncing(active);
        if (!active) reload();
      }),
    [reload],
  );

  if (!isCloudConfigured()) return null;

  async function handleBackUpNow() {
    setOutcome(null);
    const result = await syncBackup({ force: true });
    setOutcome(result);
    reload();
  }

  async function handleSavePhone() {
    const normalised = normaliseKenyanMobile(phoneDraft);
    if (!normalised) {
      setPhoneError('Enter a Safaricom or Airtel number, for example 0712 345 678.');
      return;
    }
    await updateSettings({ farmerPhone: normalised });
    setPhone(normalised);
    setPhoneDraft('');
    // Sent straight away, so the saved copy can be found under this number.
    syncBackup().then(setOutcome).catch(() => {});
  }

  const status = syncing
    ? 'Saving your records online…'
    : !hasRecords
      ? 'Starts on its own once you add your first animal or flock.'
      : outcome?.state === 'moved'
        ? 'Your records now back up from your other phone.'
        : outcome?.state === 'offline'
          ? 'No internet right now. It will save on its own when there is.'
          : outcome?.state === 'failed'
            ? `Could not save: ${outcome.message}`
            : lastSavedAt
              ? `Saved online ${ago(lastSavedAt)}. It saves again on its own whenever you change something.`
              : 'Saves on its own whenever you have internet.';

  return (
    <Surface level="raised" className="gap-3 p-4">
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name={lastSavedAt ? 'cloud-done' : 'cloud-outline'} size={22} color={colors.brand} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-body font-sans-medium text-primary">Your records are copied online</Text>
          <Text className="text-label text-secondary">{status}</Text>
        </View>
      </View>

      {hasRecords ? (
        <Button label="Back up now" variant="secondary" fullWidth loading={syncing} onPress={handleBackUpNow} />
      ) : null}

      {phone ? (
        <Text className="text-label text-tertiary">
          On a new phone, get them back with {formatKenyanMobile(phone)} and a code.
        </Text>
      ) : hasRecords ? (
        <View className="gap-2 border-t border-line pt-3">
          <Text className="text-label text-secondary">
            Optional: add your number so you can get these records back if you ever change phone.
          </Text>
          <TextField
            label="Phone number"
            value={phoneDraft}
            onChangeText={(next) => {
              setPhoneDraft(next);
              setPhoneError(null);
            }}
            keyboardType="phone-pad"
            placeholder="0712 345 678"
            error={phoneError ?? undefined}
          />
          <Button label="Save number" variant="ghost" fullWidth disabled={phoneDraft.trim().length < 9} onPress={handleSavePhone} />
        </View>
      ) : null}

      <PressableSurface
        level="flat"
        onPress={() => router.push('/account')}
        className="flex-row items-center justify-between border-t border-line pt-3"
      >
        <Text className="text-callout font-sans-medium text-brand">New phone? Get your records back</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.brand} />
      </PressableSurface>
    </Surface>
  );
}
