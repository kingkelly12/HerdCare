import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/theme/colors';
import { isCloudConfigured } from '@/lib/api/client';
import { getCloudAccount } from '@/db/cloudAccount';
import { downloadBackup, uploadBackup } from '@/lib/api/cloudBackup';
import { formatDateForDisplay } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';
import type { CloudAccount } from '@/db/schema';

/**
 * Backing the farmer's records up off the phone, and pulling them back down.
 *
 * Sits next to the file export rather than replacing it. The file is what a farmer can hand to
 * somebody or keep on an SD card with no account at all; this is the one that survives the phone
 * going into a dam, and it is the reason a subscription is worth renewing.
 */
export function CloudBackupSection() {
  const colors = useColors();
  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [busy, setBusy] = useState<'up' | 'down' | null>(null);

  useFocusEffect(
    useCallback(() => {
      // Re-read on focus, because signing in happens on another screen and this card has to notice.
      getCloudAccount()
        .then(setAccount)
        .catch(() => {});
    }, []),
  );

  if (!isCloudConfigured()) return null;

  async function handleUpload() {
    setBusy('up');
    const result = await uploadBackup();
    setBusy(null);

    if (!result.ok) {
      Alert.alert('Could not back up', result.error);
      return;
    }

    notifySaved();
    setAccount(await getCloudAccount());
    Alert.alert('Backed up', 'Your records are saved. They will come back if you ever change phone.');
  }

  function confirmDownload() {
    Alert.alert(
      'Bring records onto this phone?',
      'Anything missing here is added. Nothing already on this phone is removed or overwritten.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setBusy('down');
            const result = await downloadBackup();
            setBusy(null);

            if (!result.ok) {
              Alert.alert('Could not restore', result.error);
              return;
            }

            const added = Object.values(result.data.added ?? {}).reduce(
              (sum, n) => sum + (Number(n) || 0),
              0,
            );
            notifySaved();
            Alert.alert('Restored', `${added} record${added === 1 ? '' : 's'} brought onto this phone.`);
          },
        },
      ],
    );
  }

  if (!account) {
    return (
      <PressableSurface onPress={() => router.push('/account')} className="flex-row items-center gap-3 p-4">
        <View className="h-11 w-11 items-center justify-center rounded-pill bg-earth-soft">
          <Ionicons name="cloud-upload-outline" size={22} color={colors.earth} />
        </View>
        <View className="flex-1">
          <Text className="text-body font-sans-medium text-primary">Keep a copy off this phone</Text>
          <Text className="text-label text-tertiary">
            Link your M-Pesa number so your records survive a lost phone
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
      </PressableSurface>
    );
  }

  return (
    <Surface level="raised" className="gap-3 p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name="cloud-done" size={22} color={colors.brand} />
        </View>
        <View className="flex-1">
          <Text className="text-body font-sans-medium text-primary">{account.phone}</Text>
          <Text className="text-label text-tertiary">
            {account.lastBackupAt
              ? `Last saved ${formatDateForDisplay(account.lastBackupAt)}`
              : 'Not saved online yet'}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label="Back up now"
            fullWidth
            loading={busy === 'up'}
            disabled={busy !== null}
            onPress={handleUpload}
          />
        </View>
        <View className="flex-1">
          <Button
            label="Restore"
            variant="secondary"
            fullWidth
            loading={busy === 'down'}
            disabled={busy !== null}
            onPress={confirmDownload}
          />
        </View>
      </View>

      <Button label="Manage this phone" variant="ghost" fullWidth onPress={() => router.push('/account')} />
    </Surface>
  );
}
