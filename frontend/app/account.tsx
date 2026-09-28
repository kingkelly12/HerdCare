import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { useColors } from '@/theme/colors';
import { isCloudConfigured } from '@/lib/api/client';
import { requestSignInCode, verifySignInCode } from '@/lib/api/account';
import { downloadBackup } from '@/lib/api/cloudBackup';
import { restoreFromInstall } from '@/lib/cloudSync';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';
import { useLicense } from '@/components/license/LicenseProvider';
import { formatDateForDisplay } from '@/utils/livestockRules';
import type { RestoreSummary } from '@/lib/backup';

function countAdded(summary: RestoreSummary): number {
  return Object.values(summary.added ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/**
 * Getting a farmer's records back onto a new phone.
 *
 * Backing up needs nothing from the farmer: it happens on its own (see lib/cloudSync.ts). This is
 * the one moment that needs proof, because it hands somebody's whole farm to the phone in front of
 * us. The proof is a code sent by SMS to the old number, or read out by the farmer's agent.
 */
export default function AccountScreen() {
  const colors = useColors();
  const { refresh: refreshLicence } = useLicense();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code' | 'done'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleRequestCode() {
    setBusy(true);
    setError(null);
    setNote(null);
    const response = await requestSignInCode(phone.trim());
    setBusy(false);

    if (!response.ok) {
      // With SMS switched off the server says so; the agent route below still works.
      setError(response.error);
      return;
    }
    setStage('code');
    setNote(response.data.devCode ? `Development code: ${response.data.devCode}` : response.data.message);
  }

  async function handleVerify() {
    setBusy(true);
    setError(null);

    const verified = await verifySignInCode(phone.trim(), code.trim());
    if (!verified.ok) {
      setBusy(false);
      setError(verified.error);
      return;
    }

    // A subscription, if there was one, came down with the sign-in.
    await refreshLicence();

    const { install, backup, farm } = verified.data;
    let message: string;

    if (install) {
      const restored = await restoreFromInstall(install);
      message = restored.ok
        ? `${countAdded(restored.summary)} records brought back, saved ${formatDateForDisplay(install.savedAt)}. This phone now backs up in their place.`
        : `Found your records, but could not bring them onto this phone: ${restored.error}`;
    } else if (backup.available) {
      const restored = await downloadBackup();
      message = restored.ok
        ? `${countAdded(restored.data)} records brought back, saved ${formatDateForDisplay(backup.savedAt ?? null)}.`
        : `Found your records, but could not bring them onto this phone: ${restored.error}`;
    } else {
      message = farm
        ? 'Your subscription is back on this phone. There was no saved copy of your records.'
        : 'There was no saved copy of your records for that number.';
    }

    await refreshRemindersAndNotifications().catch(() => {});
    setBusy(false);
    setResult(message);
    setStage('done');
  }

  if (!isCloudConfigured()) {
    return (
      <ScreenContainer>
        <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-8">
          <Ionicons name="cloud-offline-outline" size={40} color={colors.tertiary} />
          <Text className="text-headline font-sans-semibold text-primary">Not available in this version</Text>
          <Text className="px-4 text-center text-callout text-secondary">
            Your records are safe on this phone, and you can still save a backup file from Settings.
          </Text>
        </Animated.View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-4">
        <View className="h-16 w-16 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name={stage === 'done' ? 'checkmark-circle' : 'phone-portrait-outline'} size={30} color={colors.brand} />
        </View>
        <Text className="text-center text-title font-sans-bold text-primary">
          {stage === 'done' ? 'Done' : 'Get your records back'}
        </Text>
        <Text className="px-2 text-center text-callout text-secondary">
          {stage === 'done'
            ? result
            : 'For a new or replacement phone. Enter the M-Pesa number you gave HerdCare on your old phone, then the 6-digit code sent to it or given to you by your agent.'}
        </Text>
      </Animated.View>

      {stage === 'done' ? (
        <Button label="Go to my farm" fullWidth onPress={() => router.replace('/' as any)} />
      ) : stage === 'phone' ? (
        <Surface level="raised" className="gap-3 p-4">
          <TextField
            label="M-Pesa number"
            value={phone}
            onChangeText={(next) => {
              setPhone(next);
              setError(null);
            }}
            keyboardType="phone-pad"
            placeholder="0712 345 678"
            error={error ?? undefined}
          />
          <Button label="Send me a code" fullWidth loading={busy} disabled={phone.trim().length < 9} onPress={handleRequestCode} />
          <Button
            label="My agent gave me a code"
            variant="secondary"
            fullWidth
            disabled={phone.trim().length < 9}
            onPress={() => {
              setError(null);
              setNote('Enter the 6-digit code your agent gave you.');
              setStage('code');
            }}
          />
        </Surface>
      ) : (
        <Surface level="raised" className="gap-3 p-4">
          <TextField
            label="6-digit code"
            value={code}
            onChangeText={(next) => {
              setCode(next);
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            error={error ?? undefined}
            hint={note ?? undefined}
          />
          <Button label="Bring my records back" fullWidth loading={busy} disabled={code.trim().length < 6} onPress={handleVerify} />
          <Button
            label="Use a different number"
            variant="ghost"
            fullWidth
            onPress={() => {
              setStage('phone');
              setCode('');
              setError(null);
            }}
          />
        </Surface>
      )}

      {stage !== 'done' ? (
        <Callout tone="brand">
          Records on this phone are kept. Anything missing is added; nothing is overwritten.
        </Callout>
      ) : null}
    </ScreenContainer>
  );
}
