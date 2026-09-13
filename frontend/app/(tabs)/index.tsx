import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, asc, desc, eq, gte, isNotNull, lt, lte, notInArray } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { Fab } from '@/components/ui/Fab';
import { db } from '@/db/client';
import { refreshReminderData } from '@/lib/reminderSync';
import { animals, birthRecords, breedingEvents, healthLogs, reminders, settings } from '@/db/schema';
import { SpeciesAvatar } from '@/components/animals/SpeciesIcon';
import { useLicense } from '@/components/license/LicenseProvider';
import { RENEWAL_NOTICE_DAYS } from '@/lib/license/status';
import { useColors } from '@/theme/colors';
import { REMINDER_TYPE_META, isReminderTypeEnabled } from '@/utils/reminderRules';
import { addDaysIso, daysFromToday, formatDateForDisplay, startOfTodayIso } from '@/utils/livestockRules';

/** How far ahead the "Due soon" figure looks. */
const DUE_SOON_DAYS = 30;
/** How many of the due/overdue reminders to preview on the dashboard. */
const ATTENTION_PREVIEW = 4;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Metric({ value, label, tone = 'brand' }: { value: number; label: string; tone?: 'brand' | 'warn' }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text className={`text-metric font-sans-bold ${tone === 'warn' ? 'text-warn' : 'text-primary'}`}>{value}</Text>
      <Text className="text-label text-tertiary">{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const { status } = useLicense();

  /**
   * Shown only during the final week of the free trial (<= 7 days left).
   *
   * We do not display this during the first three weeks so new farmers aren't alarmed about paying
   * before experiencing the value of the app. Once they have their herd & flock set up and are
   * in the final week, a gentle notice informs them how many days remain.
   */
  const trialDaysLeft =
    status?.state === 'trial' && status.daysLeft <= RENEWAL_NOTICE_DAYS ? status.daysLeft : null;

  // Bounds are the start of the local day, not the current instant — comparing against "now"
  // made anything due or ending earlier today drop off the dashboard as the day went on.
  const today = startOfTodayIso();
  const dueSoonCutoff = addDaysIso(today, DUE_SOON_DAYS + 1);

  // Recomputing what's due rewrites the reminders table many times in a row (see
  // rebuildDerivedReminders), and each of those writes pokes the query below. Tracked so "Needs
  // attention" doesn't flash a false all-clear while that's still running — see the same note on
  // the dedicated Reminders screen.
  const [refreshing, setRefreshing] = useState(true);

  // The day can roll over while the app sits open in the field, so re-derive on every focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setRefreshing(true);
      refreshReminderData()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setRefreshing(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const { data: dueNow, updatedAt: dueNowUpdatedAt } = useLiveQuery(
    db
      .select({ reminder: reminders, animal: animals })
      .from(reminders)
      .leftJoin(animals, eq(reminders.animalId, animals.id))
      .where(and(eq(reminders.status, 'pending'), lte(reminders.dueDate, addDaysIso(today, 1))))
      .orderBy(asc(reminders.dueDate)),
  );

  // "In the herd" means every animal still on the farm, which includes one sitting out a drug
  // withdrawal — it is still yours to feed and care for, just not to sell from. Counting only
  // `active` also contradicted the withdrawal figure below, which uses this same filter: a single
  // animal under withdrawal would read "0 in the herd, 1 in withdrawal". Sold and deceased
  // animals are the ones that have genuinely left.
  const { data: herdAnimals } = useLiveQuery(
    db.select().from(animals).where(notInArray(animals.status, ['sold', 'deceased'])),
  );

  // Distinct animals, not treatment rows: overlapping treatments on one animal are one animal
  // in withdrawal. Sold and deceased animals are no longer part of the working herd.
  const { data: inWithdrawal } = useLiveQuery(
    db
      .selectDistinct({ animalId: healthLogs.animalId })
      .from(healthLogs)
      .innerJoin(animals, eq(healthLogs.animalId, animals.id))
      .where(
        and(
          isNotNull(healthLogs.withdrawalEndDate),
          gte(healthLogs.withdrawalEndDate, today),
          notInArray(animals.status, ['sold', 'deceased']),
        ),
      ),
  );

  const { data: upcomingDue } = useLiveQuery(
    db
      .select()
      .from(breedingEvents)
      .innerJoin(animals, eq(breedingEvents.animalId, animals.id))
      .where(
        and(
          isNotNull(breedingEvents.expectedDueDate),
          gte(breedingEvents.expectedDueDate, today),
          lt(breedingEvents.expectedDueDate, dueSoonCutoff),
        ),
      )
      .orderBy(breedingEvents.expectedDueDate),
  );

  const { data: recentBreeding } = useLiveQuery(
    db
      .select()
      .from(breedingEvents)
      .innerJoin(animals, eq(breedingEvents.animalId, animals.id))
      .orderBy(desc(breedingEvents.createdAt))
      .limit(5),
  );

  const { data: recentHealth } = useLiveQuery(
    db
      .select()
      .from(healthLogs)
      .innerJoin(animals, eq(healthLogs.animalId, animals.id))
      .orderBy(desc(healthLogs.createdAt))
      .limit(5),
  );

  const { data: recentBirths } = useLiveQuery(
    db
      .select()
      .from(birthRecords)
      .innerJoin(animals, eq(birthRecords.motherId, animals.id))
      .orderBy(desc(birthRecords.createdAt))
      .limit(5),
  );

  const recentActivity = [
    ...(recentBreeding ?? []).map((row) => ({
      key: `breeding-${row.breeding_events.id}`,
      date: row.breeding_events.createdAt,
      tag: row.animals.tagNumber,
      species: row.animals.species,
      text: row.breeding_events.eventType.replace(/_/g, ' '),
    })),
    ...(recentHealth ?? []).map((row) => ({
      key: `health-${row.health_logs.id}`,
      date: row.health_logs.createdAt,
      tag: row.animals.tagNumber,
      species: row.animals.species,
      text: `Treated for ${row.health_logs.conditionTreated}`,
    })),
    ...(recentBirths ?? []).map((row) => ({
      key: `birth-${row.birth_records.id}`,
      date: row.birth_records.createdAt,
      tag: row.animals.tagNumber,
      species: row.animals.species,
      text:
        row.birth_records.liveBirths === 1
          ? 'Birth · 1 live offspring'
          : `Birth · ${row.birth_records.liveBirths} live offspring`,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const prefs = settingsRows?.[0];

  // Honours the Settings toggles, same as the Reminders screen and the daily notification.
  const attention = (dueNow ?? []).filter((row) => isReminderTypeEnabled(prefs, row.reminder.type));
  // See the note by `refreshing` above — only trust an empty list once a rebuild has actually
  // completed against it, not merely because nothing had loaded yet.
  const attentionResolving = (!dueNowUpdatedAt || refreshing) && attention.length === 0;
  const daysSinceBackup = prefs?.lastBackupAt ? Math.abs(daysFromToday(prefs.lastBackupAt) ?? 0) : null;
  const backupStale = (herdAnimals?.length ?? 0) > 0 && (daysSinceBackup === null || daysSinceBackup >= 30);

  return (
    <ScreenContainer fab={<Fab icon="add" label="Log" onPress={() => router.push('/log')} />}>
      <Animated.View entering={FadeInDown.duration(300)} className="gap-1 pt-6">
        <Text className="text-display font-sans-bold text-primary">{greeting()}</Text>
        {trialDaysLeft !== null ? (
          <Text className="text-callout text-tertiary">
            {trialDaysLeft === 0
              ? 'Free month ends today'
              : `Free for another ${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'}`}
          </Text>
        ) : null}
      </Animated.View>

      {/* 7-Day Referral / Community Agent Suggestion */}
      {trialDaysLeft !== null ? (
        <Animated.View entering={FadeInDown.duration(300).delay(40)}>
          <Surface level="raised" className="gap-2.5 p-4 border border-brand-soft">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-pill bg-brand-soft">
                  <Ionicons name="gift-outline" size={18} color={colors.brand} />
                </View>
                <Text className="text-callout font-sans-bold text-primary">Earn with HerdCare</Text>
              </View>
              <PressableSurface
                level="flat"
                onPress={() => router.push('/agent/join' as any)}
                className="px-2.5 py-1 rounded-pill bg-brand-soft"
              >
                <Text className="text-caption font-sans-semibold text-brand">Learn How</Text>
              </PressableSurface>
            </View>
            <Text className="text-callout text-secondary">
              Recruit neighboring farmers and earn 10% of their subscriptions + KSh 750 bounty. Cover your own subscription and earn extra income.
            </Text>
            <Button
              label="Become an Agent"
              variant="secondary"
              fullWidth
              onPress={() => router.push('/agent/join' as any)}
            />
          </Surface>
        </Animated.View>
      ) : null}

      {/* One grouped panel of figures rather than three competing cards. */}
      <Animated.View entering={FadeInDown.duration(300).delay(60)}>
        <Surface level="raised" className="flex-row p-4">
          <Metric value={herdAnimals?.length ?? 0} label="In the herd" />
          <View className="w-px bg-line" />
          <View className="w-4" />
          <Metric value={inWithdrawal?.length ?? 0} label="In withdrawal" tone="warn" />
          <View className="w-px bg-line" />
          <View className="w-4" />
          <Metric value={upcomingDue?.length ?? 0} label="Due in 30 days" />
        </Surface>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(120)} className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-headline font-sans-semibold text-primary">Needs attention</Text>
          <PressableSurface
            level="flat"
            onPress={() => router.push('/reminders')}
            className="flex-row items-center gap-1 px-2 py-1"
          >
            <Text className="text-callout font-sans-semibold text-brand">All</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.brand} />
          </PressableSurface>
        </View>

        {attentionResolving ? (
          <Surface level="raised" className="flex-row items-center gap-3 p-4">
            <ActivityIndicator color={colors.brand} />
            <Text className="flex-1 text-callout text-secondary">Checking what needs attention…</Text>
          </Surface>
        ) : attention.length === 0 ? (
          <Surface level="raised" className="flex-row items-center gap-3 p-4">
            <View className="h-11 w-11 items-center justify-center rounded-pill bg-brand-soft">
              <Ionicons name="checkmark-done" size={22} color={colors.brand} />
            </View>
            <Text className="flex-1 text-callout text-secondary">
              Nothing due today. Reminders appear here on their own as you log events.
            </Text>
          </Surface>
        ) : (
          <Surface level="raised" className="overflow-hidden">
            {attention.slice(0, ATTENTION_PREVIEW).map(({ reminder, animal }, i) => {
              const late = (daysFromToday(reminder.dueDate) ?? 0) < 0;
              return (
                <PressableSurface
                  key={reminder.id}
                  level="flat"
                  onPress={() => router.push('/reminders')}
                  className={`flex-row items-center gap-3 rounded-none p-3 ${i > 0 ? 'border-t border-line' : ''}`}
                >
                  {animal ? (
                    <SpeciesAvatar species={animal.species} size={20} tone={late ? 'danger' : 'warn'} />
                  ) : (
                    <View className="h-10 w-10 items-center justify-center rounded-pill bg-earth-soft">
                      <Ionicons name={REMINDER_TYPE_META[reminder.type].icon} size={20} color={colors.earth} />
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-body font-sans-medium text-primary">
                      {animal ? `${animal.tagNumber} · ` : ''}
                      {reminder.title}
                    </Text>
                    <Text className={`text-label ${late ? 'text-danger' : 'text-warn'}`}>
                      {late ? 'Overdue' : 'Today'} · {formatDateForDisplay(reminder.dueDate)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
                </PressableSurface>
              );
            })}
            {attention.length > ATTENTION_PREVIEW ? (
              <View className="border-t border-line px-3 py-2">
                <Text className="text-label text-tertiary">+{attention.length - ATTENTION_PREVIEW} more</Text>
              </View>
            ) : null}
          </Surface>
        )}
      </Animated.View>

      {/* Farmers rarely open Settings, and an un-backed-up herd is the one loss they cannot undo,
          so the prompt has to live where they actually look. */}
      {backupStale ? (
        <Animated.View entering={FadeInDown.duration(300).delay(150)}>
          <PressableSurface level="raised" onPress={() => router.push('/settings')} className="flex-row items-center gap-3 p-4">
            <View className="h-11 w-11 items-center justify-center rounded-pill bg-warn-soft">
              <Ionicons name="cloud-upload-outline" size={22} color={colors.warn} />
            </View>
            <View className="flex-1">
              <Text className="text-body font-sans-semibold text-primary">
                {prefs?.lastBackupAt ? 'Your backup is out of date' : 'Your records are not backed up'}
              </Text>
              <Text className="text-label text-tertiary">
                They exist only on this phone. Tap to save a copy you can keep elsewhere.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
          </PressableSurface>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(300).delay(180)} className="gap-2">
        <Text className="text-headline font-sans-semibold text-primary">Recent activity</Text>
        {recentActivity.length === 0 ? (
          <Text className="text-callout text-tertiary">Events you log will appear here.</Text>
        ) : (
          // Flat rows on the canvas, not another stack of cards.
          <View className="gap-3 px-1">
            {recentActivity.map((item) => (
              <View key={item.key} className="flex-row items-center gap-3">
                <SpeciesAvatar species={item.species} size={18} />
                <View className="flex-1">
                  <Text className="text-callout font-sans-medium capitalize text-primary">{item.text}</Text>
                  <Text className="text-label text-tertiary">
                    {item.tag} · {formatDateForDisplay(item.date)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Animated.View>

      <View className="h-16" />
    </ScreenContainer>
  );
}
