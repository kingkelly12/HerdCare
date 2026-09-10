import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, desc, eq, gte } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { currentFlockCount, mortalityRate } from '@/db/flocks';
import { formatEggs, layingPercentage, totalBroken, totalCollected } from '@/db/eggs';
import { LAYING_POULTRY_TYPES, eggRecords, flockEvents, flocks } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { addDaysIso, formatDateForDisplay, startOfTodayIso } from '@/utils/livestockRules';
import { FLOCK_EVENT_META, POULTRY_TYPE_META, flockAgeInDays, formatFlockAge } from '@/utils/poultryRules';

export default function FlockDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const { data: flockRows } = useLiveQuery(db.select().from(flocks).where(eq(flocks.id, id)), [id]);
  const flock = flockRows?.[0];

  const { data: events } = useLiveQuery(
    db.select().from(flockEvents).where(eq(flockEvents.flockId, id)).orderBy(desc(flockEvents.eventDate)),
    [id],
  );

  // The last week of collections, which is enough to show whether lay is holding up.
  const eggsSince = addDaysIso(startOfTodayIso(), -6);
  const { data: eggs } = useLiveQuery(
    db
      .select()
      .from(eggRecords)
      .where(and(eq(eggRecords.flockId, id), gte(eggRecords.recordDate, eggsSince)))
      .orderBy(desc(eggRecords.recordDate)),
    [id, eggsSince],
  );

  if (!flock) {
    return (
      <ScreenContainer>
        <EmptyState icon="egg-outline" title="Flock not found" />
      </ScreenContainer>
    );
  }

  const timeline = events ?? [];
  const birds = currentFlockCount(flock, timeline);
  const lostRate = mortalityRate(flock, timeline);
  const ageDays = flockAgeInDays(flock);

  const lays = (LAYING_POULTRY_TYPES as readonly string[]).includes(flock.poultryType);
  const eggRows = eggs ?? [];
  const weekCollected = totalCollected(eggRows);
  const weekBroken = totalBroken(eggRows);
  const daysRecorded = eggRows.length;
  const eggsPerDay = daysRecorded > 0 ? weekCollected / daysRecorded : 0;
  const rate = layingPercentage(eggsPerDay, birds);

  return (
    <ScreenContainer fab={<Fab icon="clipboard-outline" label="Log" onPress={() => router.push(`/flock/${id}/log`)} />}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit flock"
              onPress={() => router.push(`/flock/${id}/edit`)}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center"
            >
              <Ionicons name="pencil-outline" size={22} color={colors.brand} />
            </Pressable>
          ),
        }}
      />

      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-2">
        <View className="h-20 w-20 items-center justify-center rounded-pill bg-brand-soft">
          <Text className="text-metric font-sans-bold text-brand">{birds}</Text>
        </View>
        <Text className="text-title font-sans-bold text-primary">{flock.name}</Text>
        <Text className="text-callout text-secondary">
          {POULTRY_TYPE_META[flock.poultryType].label}
          {flock.breed ? ` · ${flock.breed}` : ''}
        </Text>
        <Text className="text-label text-tertiary">{formatFlockAge(ageDays)}</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(60)}>
        <Surface level="raised" className="flex-row p-4">
          <View className="flex-1 gap-0.5">
            <Text className="text-headline font-sans-bold text-primary">{flock.initialCount}</Text>
            <Text className="text-label text-tertiary">Started with</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-headline font-sans-bold text-primary">{birds}</Text>
            <Text className="text-label text-tertiary">Alive now</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className={`text-headline font-sans-bold ${lostRate >= 10 ? 'text-danger' : 'text-primary'}`}>
              {Math.round(lostRate * 10) / 10}%
            </Text>
            <Text className="text-label text-tertiary">Lost</Text>
          </View>
        </Surface>
      </Animated.View>

      {lostRate >= 10 ? (
        <Surface level="raised" className="flex-row items-center gap-3 bg-danger-soft p-4">
          <Ionicons name="warning-outline" size={20} color={colors.danger} />
          <Text className="flex-1 text-callout text-danger">
            More than one bird in ten has been lost. Worth checking feed, water and housing.
          </Text>
        </Surface>
      ) : null}

      {lays ? (
        <Animated.View entering={FadeInDown.duration(280).delay(90)} className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-headline font-sans-semibold text-primary">Eggs this week</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/log/eggs')}
              hitSlop={8}
              className="flex-row items-center gap-1 px-2 py-1"
            >
              <Text className="text-callout font-sans-semibold text-brand">Record</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.brand} />
            </Pressable>
          </View>

          {daysRecorded === 0 ? (
            <Surface level="raised" className="p-4">
              <Text className="text-callout text-secondary">
                No collections recorded in the last week. Tap Record to add today&apos;s.
              </Text>
            </Surface>
          ) : (
            <Surface level="raised" className="gap-3 p-4">
              <View className="flex-row">
                <View className="flex-1 gap-0.5">
                  <Text className="text-headline font-sans-bold text-primary">{formatEggs(weekCollected)}</Text>
                  <Text className="text-label text-tertiary">Over {daysRecorded} {daysRecorded === 1 ? 'day' : 'days'}</Text>
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className={`text-headline font-sans-bold ${rate < 50 ? 'text-warn' : 'text-brand'}`}>
                    {Math.round(rate)}%
                  </Text>
                  <Text className="text-label text-tertiary">Lay rate</Text>
                </View>
              </View>
              {weekBroken > 0 ? (
                <Text className="border-t border-line pt-3 text-label text-tertiary">
                  {weekBroken} broken or cracked
                </Text>
              ) : null}
            </Surface>
          )}
        </Animated.View>
      ) : null}

      <View className="gap-2">
        <Text className="text-headline font-sans-semibold text-primary">History</Text>
        {timeline.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title="Nothing logged yet"
            description="Record deaths, vaccinations and feed changes and they will appear here."
          />
        ) : (
          timeline.map((event, index) => {
            const meta = FLOCK_EVENT_META[event.type];
            const reduces = meta.reducesCount && (event.quantity ?? 0) > 0;
            return (
              <Animated.View key={event.id} entering={FadeInDown.duration(240).delay(Math.min(index, 8) * 35)}>
                <Surface level="raised" className="flex-row items-center gap-3 p-4">
                  <Ionicons name={meta.icon} size={22} color={reduces ? colors.danger : colors.brand} />
                  <View className="flex-1">
                    <Text className="text-body font-sans-semibold text-primary">
                      {meta.label}
                      {event.quantity ? ` · ${event.quantity} ${event.quantity === 1 ? 'bird' : 'birds'}` : ''}
                    </Text>
                    {event.description ? (
                      <Text className="text-callout text-secondary">{event.description}</Text>
                    ) : null}
                    <Text className="text-label text-tertiary">{formatDateForDisplay(event.eventDate)}</Text>
                  </View>
                </Surface>
              </Animated.View>
            );
          })
        )}
      </View>

      <View className="h-16" />
    </ScreenContainer>
  );
}
