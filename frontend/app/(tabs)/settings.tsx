import { useCallback, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { db } from '@/db/client';
import { updateSettings } from '@/db/reminders';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';
import { animals, birthRecords, breedingEvents, healthLogs, settings } from '@/db/schema';
import { BackupSection } from '@/components/settings/BackupSection';
import { SubscriptionSection } from '@/components/settings/SubscriptionSection';
import { CloudBackupSection } from '@/components/settings/CloudBackupSection';
import { router, useFocusEffect } from 'expo-router';
import { getCloudAccount } from '@/db/cloudAccount';
import { useColors } from '@/theme/colors';
import { useLicense } from '@/components/license/LicenseProvider';
import { notifySaved } from '@/lib/haptics';

const DIGEST_HOUR_OPTIONS = ['5', '6', '7', '8'].map((hour) => ({ value: hour, label: `${hour}:00` }));

function SectionTitle({ children }: { children: string }) {
  return <Text className="px-1 text-label font-sans-semibold uppercase text-tertiary">{children}</Text>;
}

function Row({
  icon,
  title,
  subtitle,
  divider,
  right,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  divider?: boolean;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const colors = useColors();
  const inner = (
    <View className={`flex-row items-center gap-3 px-4 py-3 ${divider ? 'border-t border-line' : ''}`}>
      <Ionicons name={icon} size={20} color={colors.secondary} />
      <View className="flex-1">
        <Text className="text-body font-sans-medium text-primary">{title}</Text>
        <Text className="text-label text-tertiary">{subtitle}</Text>
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.tertiary} /> : null)}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-70">
        {inner}
      </Pressable>
    );
  }

  return inner;
}

export default function SettingsScreen() {
  const colors = useColors();
  const [counts, setCounts] = useState<{ animals: number; breeding: number; health: number; births: number } | null>(null);
  // The About row used to claim "not connected yet" forever. Read the real state instead.
  const [cloudLinked, setCloudLinked] = useState<string | null>(null);

  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const prefs = settingsRows?.[0];

  // Drives whether the backup nudge is worth showing at all — no records, nothing to lose.
  const { data: herdRows } = useLiveQuery(db.select({ id: animals.id }).from(animals));
  const herdSize = herdRows?.length ?? 0;

  // Held locally while typing and written on blur — persisting every keystroke would fight the
  // live query for control of the text field.
  const [milkPrice, setMilkPrice] = useState<string | null>(null);
  const [eggPrice, setEggPrice] = useState<string | null>(null);
  const [eggUnitPrice, setEggUnitPrice] = useState<string | null>(null);
  const [meatPrice, setMeatPrice] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);

  const { refresh: refreshLicense } = useLicense();
  const [inputReferral, setInputReferral] = useState('');
  const [savingReferral, setSavingReferral] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);

  async function handleApplyReferral() {
    const code = inputReferral.trim().toUpperCase();
    if (!code) {
      setReferralError('Enter an agent or farmer referral code.');
      return;
    }
    setSavingReferral(true);
    setReferralError(null);
    try {
      await updateSettings({ agentCode: code });
      await refreshLicense();
      notifySaved();
      setInputReferral('');
      Alert.alert(
        'Bonus Days Activated!',
        `Linked to agent ${code}. You have unlocked +7 extra free trial days!`,
      );
    } catch {
      setReferralError('Failed to save referral code.');
    } finally {
      setSavingReferral(false);
    }
  }
  const milkPriceValue = milkPrice ?? String(prefs?.milkPricePerLitre ?? 0);
  const eggPriceValue = eggPrice ?? String(prefs?.eggPricePerTray ?? 0);
  const eggUnitPriceValue = eggUnitPrice ?? String(prefs?.eggPricePerEgg ?? 0);
  const meatPriceValue = meatPrice ?? String(prefs?.meatPricePerKg ?? 0);
  const currencyValue = currency ?? prefs?.currency ?? 'KES';

  useFocusEffect(
    useCallback(() => {
      getCloudAccount()
        .then((row) => setCloudLinked(row?.phone ?? null))
        .catch(() => {});
    }, []),
  );

  const asPrice = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  function commitEggPrice() {
    patchSettings({ eggPricePerTray: asPrice(eggPriceValue) });
  }

  function commitEggUnitPrice() {
    patchSettings({ eggPricePerEgg: asPrice(eggUnitPriceValue) });
  }

  function commitMeatPrice() {
    patchSettings({ meatPricePerKg: asPrice(meatPriceValue) });
  }

  function commitMilkPrice() {
    const parsed = Number.parseFloat(milkPriceValue);
    patchSettings({ milkPricePerLitre: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 });
  }

  function commitCurrency() {
    const trimmed = currencyValue.trim().toUpperCase();
    if (trimmed) patchSettings({ currency: trimmed });
  }

  async function patchSettings(patch: Parameters<typeof updateSettings>[0]) {
    await updateSettings(patch);
    // Not awaited — see the note in log/breeding.tsx. A switch should flip the instant it's
    // tapped, not wait on rescheduling every pending notification.
    refreshRemindersAndNotifications().catch(() => {});
  }

  async function refreshCounts() {
    const [[a], [b], [h], [r]] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(animals),
      db.select({ count: sql<number>`count(*)` }).from(breedingEvents),
      db.select({ count: sql<number>`count(*)` }).from(healthLogs),
      db.select({ count: sql<number>`count(*)` }).from(birthRecords),
    ]);
    setCounts({ animals: a.count, breeding: b.count, health: h.count, births: r.count });
  }

  const toggle = (value: boolean, onChange: (next: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colors.brand, false: colors.borderStrong }}
      thumbColor={colors.raised}
    />
  );

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="pt-4">
        <Text className="text-title font-sans-bold text-primary">Settings</Text>
      </Animated.View>

      {prefs ? (
        <View className="gap-2">
          <SectionTitle>Selling prices</SectionTitle>
          <Surface level="raised" className="gap-3 p-4">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="Price per litre"
                  value={milkPriceValue}
                  onChangeText={setMilkPrice}
                  onBlur={commitMilkPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View className="w-28">
                <TextField
                  label="Currency"
                  value={currencyValue}
                  onChangeText={setCurrency}
                  onBlur={commitCurrency}
                  autoCapitalize="characters"
                  maxLength={4}
                />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="Price per tray of eggs"
                  value={eggPriceValue}
                  onChangeText={setEggPrice}
                  onBlur={commitEggPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View className="flex-1">
                <TextField
                  label="Price per egg"
                  value={eggUnitPriceValue}
                  onChangeText={setEggUnitPrice}
                  onBlur={commitEggUnitPrice}
                  keyboardType="decimal-pad"
                  hint="For customers buying loose."
                />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="Price per kg of meat"
                  value={meatPriceValue}
                  onChangeText={setMeatPrice}
                  onBlur={commitMeatPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View className="flex-1" />
            </View>
            <Text className="text-label text-tertiary">
              What you sell for. Loose eggs have their own price because a single egg normally fetches more than a
              share of a tray. Every record keeps the price it was saved with, so raising a price never rewrites what
              you already earned or what somebody already owes.
            </Text>
          </Surface>
        </View>
      ) : null}

      <View className="gap-2">
        <SectionTitle>Subscription & Referral</SectionTitle>
        <SubscriptionSection />
        <Surface level="raised" className="p-4 gap-3">
          {prefs?.agentCode ? (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <View className="h-10 w-10 items-center justify-center rounded-pill bg-brand-soft">
                  <Ionicons name="gift" size={20} color={colors.brand} />
                </View>
                <View className="flex-1">
                  <Text className="text-body font-sans-medium text-primary">Referral Code Linked</Text>
                  <Text className="text-label text-secondary">
                    Agent <Text className="font-sans-bold text-brand">{prefs.agentCode}</Text> · +7 bonus days active
                  </Text>
                </View>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
            </View>
          ) : (
            <View className="gap-3">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-pill bg-brand-soft">
                  <Ionicons name="gift-outline" size={20} color={colors.brand} />
                </View>
                <View className="flex-1">
                  <Text className="text-body font-sans-medium text-primary">Introduced by a farmer?</Text>
                  <Text className="text-label text-tertiary">
                    Enter their referral code to unlock +7 extra free trial days.
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-2 items-center pt-1">
                <View className="flex-1">
                  <TextField
                    label="Agent or Farmer Code"
                    value={inputReferral}
                    onChangeText={(t) => {
                      setInputReferral(t.toUpperCase());
                      setReferralError(null);
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="e.g. KIP-492"
                  />
                </View>
                <View className="pt-5">
                  <Button
                    label="Apply"
                    variant="primary"
                    loading={savingReferral}
                    onPress={handleApplyReferral}
                  />
                </View>
              </View>
              {referralError ? <Callout tone="warn">{referralError}</Callout> : null}
            </View>
          )}
        </Surface>
      </View>

      <View className="gap-2">
        <SectionTitle>Field Agents & Admin</SectionTitle>
        <Surface level="raised">
          <Row
            icon="people-outline"
            title="Agent Portal"
            subtitle="Track your farmers, commissions & renewal reminders"
            onPress={() => router.push('/agent' as any)}
          />
          <Row
            icon="briefcase-outline"
            title="Admin Desk"
            subtitle="Register field agents & settle commission payouts"
            divider
            onPress={() => router.push('/admin' as any)}
          />
        </Surface>
      </View>

      {prefs ? (
        <View className="gap-2">
          <SectionTitle>Daily reminder</SectionTitle>
          <Surface level="raised">
            <Row
              icon="notifications-outline"
              title="Morning briefing"
              subtitle="One notification a day listing what is due"
              right={toggle(prefs.digestEnabled, (digestEnabled) => patchSettings({ digestEnabled }))}
            />
            {prefs.digestEnabled ? (
              <View className="gap-2 border-t border-line px-4 py-3">
                <Text className="text-label text-tertiary">Delivered at</Text>
                <Segmented
                  options={DIGEST_HOUR_OPTIONS}
                  value={String(prefs.digestHour)}
                  onChange={(hour) => patchSettings({ digestHour: Number(hour) })}
                />
              </View>
            ) : null}
          </Surface>
        </View>
      ) : null}

      {prefs ? (
        <View className="gap-2">
          <SectionTitle>What to remind me about</SectionTitle>
          <Surface level="raised">
            <Row
              icon="eye-outline"
              title="Watch for heat"
              subtitle="About 3 weeks after a service"
              right={toggle(prefs.remindHeatReturn, (remindHeatReturn) => patchSettings({ remindHeatReturn }))}
            />
            <Row
              icon="egg-outline"
              title="Birth due"
              subtitle="A week before, and on the day"
              divider
              right={toggle(prefs.remindBirthDue, (remindBirthDue) => patchSettings({ remindBirthDue }))}
            />
            <Row
              icon="shield-checkmark-outline"
              title="Withdrawal ends"
              subtitle="When milk and meat are safe to sell"
              divider
              right={toggle(prefs.remindWithdrawalEnd, (remindWithdrawalEnd) => patchSettings({ remindWithdrawalEnd }))}
            />
            <Row
              icon="cut-outline"
              title="Weaning due"
              subtitle="Based on each species' weaning age"
              divider
              right={toggle(prefs.remindWeaningDue, (remindWeaningDue) => patchSettings({ remindWeaningDue }))}
            />
            <Row
              icon="repeat-outline"
              title="Repeating tasks"
              subtitle="Deworming, vaccination, spraying"
              divider
              right={toggle(prefs.remindRoutine, (remindRoutine) => patchSettings({ remindRoutine }))}
            />
            <Row
              icon="shield-checkmark-outline"
              title="Poultry programme"
              subtitle="Flock vaccinations, feed changes and deworming"
              divider
              right={toggle(prefs.remindPoultry, (remindPoultry) => patchSettings({ remindPoultry }))}
            />
          </Surface>
        </View>
      ) : null}

      <View className="gap-2">
        <SectionTitle>Online backup</SectionTitle>
        <CloudBackupSection />
      </View>

      <BackupSection lastBackupAt={prefs?.lastBackupAt ?? null} hasRecords={(counts?.animals ?? herdSize) > 0} />

      <View className="gap-2">
        <SectionTitle>About</SectionTitle>
        <Surface level="raised">
          <Row icon="cloud-offline-outline" title="Offline-first" subtitle="All data lives on this device" />
          <Row
            icon={cloudLinked ? 'cloud-done-outline' : 'cloud-outline'}
            title="Online backup"
            subtitle={
              cloudLinked
                ? `This phone is linked to ${cloudLinked}`
                : 'Link your M-Pesa number to keep a copy off this phone'
            }
            divider
          />
          <Row icon="camera-outline" title="Ear-tag scanning" subtitle="Coming soon" divider />
          <Row icon="mic-outline" title="Voice logging" subtitle="Coming soon" divider />
        </Surface>
      </View>

      <Text className="pb-4 text-center text-label text-tertiary">
        HerdCare v{Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </ScreenContainer>
  );
}
