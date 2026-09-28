import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { db } from '@/db/client';
import { updateSettings } from '@/db/reminders';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';
import { animals, birthRecords, breedingEvents, flocks, healthLogs, settings } from '@/db/schema';
import { BackupSection } from '@/components/settings/BackupSection';
import { SubscriptionSection } from '@/components/settings/SubscriptionSection';
import { CloudBackupSection } from '@/components/settings/CloudBackupSection';
import { router } from 'expo-router';
import { useColors } from '@/theme/colors';
import { REFERRAL_BONUS_LABEL } from '@/lib/license/status';

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

  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const prefs = settingsRows?.[0];

  // Drives whether the backup nudge is worth showing at all — no records, nothing to lose.
  const { data: herdRows } = useLiveQuery(db.select({ id: animals.id }).from(animals));
  const herdSize = herdRows?.length ?? 0;
  const { data: flockRows } = useLiveQuery(db.select({ id: flocks.id }).from(flocks));
  // Anything worth backing up: animals or poultry. Money and customers come with them in practice.
  const hasRecords = herdSize > 0 || (flockRows?.length ?? 0) > 0;

  // Held locally while typing and written on blur, so each keystroke does not fight the live query.
  const [currency, setCurrency] = useState<string | null>(null);
  const currencyValue = currency ?? prefs?.currency ?? 'KES';

  function commitCurrency() {
    const trimmed = currencyValue.trim().toUpperCase();
    if (trimmed) patchSettings({ currency: trimmed });
    setCurrency(null);
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

      <View className="gap-2">
        <SectionTitle>Subscription & Referral</SectionTitle>
        <SubscriptionSection />
        <Surface level="raised">
          <Row
            icon={prefs?.agentCode ? 'people' : 'people-outline'}
            title={
              prefs?.agentCode
                ? `Your agent: ${prefs.referralAgentName ?? prefs.agentCode}`
                : 'Helped by an agent?'
            }
            subtitle={
              prefs?.agentCode
                ? prefs.referralSyncedAt
                  ? `${prefs.agentCode} · They can see when your free trial ends`
                  : `${prefs.agentCode} · Will reach them next time you have internet`
                : `Add their code so they can help you later, and get ${REFERRAL_BONUS_LABEL} free.`
            }
            onPress={() => router.push('/referral' as any)}
          />
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
        <CloudBackupSection hasRecords={hasRecords} />
      </View>

      <BackupSection lastBackupAt={prefs?.lastBackupAt ?? null} hasRecords={hasRecords} />

      <View className="gap-2">
        <SectionTitle>About</SectionTitle>
        <Surface level="raised">
          <Row
            icon="cash-outline"
            title="Currency"
            subtitle="Used for prices and money totals"
            right={
              <TextInput
                value={currencyValue}
                onChangeText={setCurrency}
                onBlur={commitCurrency}
                autoCapitalize="characters"
                maxLength={4}
                accessibilityLabel="Currency"
                className="min-w-16 rounded-field border border-line px-3 py-1.5 text-center text-callout font-sans-semibold text-primary"
                placeholderTextColor={colors.tertiary}
              />
            }
          />
          <Row icon="cloud-offline-outline" title="Offline-first" subtitle="All data lives on this device" divider />
          <Row
            icon="cloud-done-outline"
            title="Online backup"
            subtitle="Free and automatic. A copy is saved online whenever you have internet."
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
