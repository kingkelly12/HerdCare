import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useColors } from '@/theme/colors';
import { isCloudConfigured } from '@/lib/api/client';
import { requestSignInCode, verifySignInCode } from '@/lib/api/account';
import { downloadBackup } from '@/lib/api/cloudBackup';
import { getCloudAccount, clearCloudAccount } from '@/db/cloudAccount';
import { useLicense } from '@/components/license/LicenseProvider';
import { formatDateForDisplay } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';
import type { CloudAccount } from '@/db/schema';

/**
 * Signing in with an M-Pesa number, and putting a farmer back on a replacement phone.
 *
 * No password, because the number is the identity and a password is one more thing to lose. A
 * farmer who has ever confirmed an M-Pesa payment has already done this exact flow.
 */
export default function AccountScreen() {
  const colors = useColors();
  const { refresh: refreshLicence } = useLicense();

  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getCloudAccount()
      .then((row) => {
        setAccount(row);
        if (row) setPhone(row.phone);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function handleRequestCode() {
    setBusy(true);
    setError(null);
    setNote(null);

    const result = await requestSignInCode(phone.trim());
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setStage('code');
    // A development server with no SMS account hands the code back so the flow can be walked
    // through end to end. A production server never does this.
    setNote(result.data.devCode ? `Development code: ${result.data.devCode}` : result.data.message);
  }

  async function handleVerify() {
    setBusy(true);
    setError(null);

    const result = await verifySignInCode(phone.trim(), code.trim());
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    notifySaved();
    setAccount(await getCloudAccount());
    // The licence came down with the sign-in, so the write lock lifts without another round trip.
    await refreshLicence();

    const { backup } = result.data;
    if (!backup.available) {
      setStage('phone');
      setCode('');
      Alert.alert('Signed in', 'This phone is now linked. Back up your records from Settings.');
      return;
    }

    Alert.alert(
      'Records found',
      `A backup from ${formatDateForDisplay(backup.savedAt ?? null)} is waiting, with ${backup.records ?? 0} records. Bring it onto this phone?`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => setStage('phone') },
        { text: 'Restore', onPress: handleRestore },
      ],
    );
  }

  async function handleRestore() {
    setBusy(true);
    const result = await downloadBackup();
    setBusy(false);
    setStage('phone');
    setCode('');

    if (!result.ok) {
      Alert.alert('Could not restore', result.error);
      return;
    }

    const added = Object.values(result.data.added ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
    notifySaved();
    Alert.alert('Records restored', `${added} record${added === 1 ? '' : 's'} brought onto this phone.`);
  }

  function confirmSignOut() {
    Alert.alert(
      'Sign out of this phone?',
      'Your records stay exactly where they are. You will need a code by SMS to back up or restore again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await clearCloudAccount();
            setAccount(null);
            setStage('phone');
          },
        },
      ],
    );
  }

  if (!isCloudConfigured()) {
    return (
      <ScreenContainer>
        <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-8">
          <Ionicons name="cloud-offline-outline" size={40} color={colors.tertiary} />
          <Text className="text-headline font-sans-semibold text-primary">Not available yet</Text>
          <Text className="px-4 text-center text-callout text-secondary">
            Online backup is not switched on in this version of HerdCare. Your records are safe on
            this phone, and you can still export them from Settings.
          </Text>
        </Animated.View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-4">
        <View
          className={`h-16 w-16 items-center justify-center rounded-pill ${account ? 'bg-brand-soft' : 'bg-earth-soft'}`}
        >
          <Ionicons
            name={account ? 'cloud-done' : 'cloud-upload-outline'}
            size={30}
            color={account ? colors.brand : colors.earth}
          />
        </View>
        <Text className="text-title font-sans-bold text-primary">
          {account ? 'Phone linked' : 'Link this phone'}
        </Text>
        <Text className="px-2 text-center text-callout text-secondary">
          {account
            ? 'Your records can be backed up, and brought back if this phone is ever lost.'
            : 'Use your M-Pesa number. We send a code by SMS, the same way M-Pesa does.'}
        </Text>
      </Animated.View>

      {loaded && account ? (
        <Animated.View entering={FadeInDown.duration(280).delay(60)}>
          <Surface level="raised" className="gap-3 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-callout text-tertiary">Number</Text>
              <Text className="text-callout font-sans-medium text-primary">{account.phone}</Text>
            </View>
            <View className="flex-row items-center justify-between border-t border-line pt-3">
              <Text className="text-callout text-tertiary">Last backup</Text>
              <Text className="text-callout font-sans-medium text-primary">
                {account.lastBackupAt ? formatDateForDisplay(account.lastBackupAt) : 'Never'}
              </Text>
            </View>
          </Surface>
        </Animated.View>
      ) : null}

      {stage === 'phone' ? (
        <>
          <TextField
            label="M-Pesa number"
            value={phone}
            onChangeText={(next) => {
              setPhone(next);
              setError(null);
            }}
            keyboardType="phone-pad"
            placeholder="0712345678"
            error={error ?? undefined}
            hint="The number you use for M-Pesa."
          />
          <Button
            label={account ? 'Send a new code' : 'Send me a code'}
            fullWidth
            loading={busy}
            disabled={phone.trim().length < 9}
            onPress={handleRequestCode}
          />
        </>
      ) : (
        <>
          <TextField
            label="The code we sent you"
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
          <Button label="Continue" fullWidth loading={busy} disabled={code.trim().length < 6} onPress={handleVerify} />
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
        </>
      )}

      {account ? (
        <>
          <Button
            label="Bring my records onto this phone"
            variant="secondary"
            fullWidth
            loading={busy}
            onPress={handleRestore}
          />
          <Button label="Sign out of this phone" variant="ghost" fullWidth onPress={confirmSignOut} />
        </>
      ) : null}

      <Text className="pb-4 text-center text-label text-tertiary">
        HerdCare works with no internet at all. Linking your phone only adds a backup and a way to
        move to a new phone.
      </Text>
    </ScreenContainer>
  );
}
