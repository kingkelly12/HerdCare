import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { animals, breedingEvents, healthLogs } from '@/db/schema';
import { SPECIES_EMOJI } from '@/components/animals/speciesMeta';
import { daysFromToday, formatDateForDisplay, getRelativeDateIso } from '@/utils/livestockRules';

export default function HomeScreen() {
  const today = getRelativeDateIso(0);

  const { data: activeAnimals } = useLiveQuery(db.select().from(animals).where(eq(animals.status, 'active')));

  const { data: inWithdrawal } = useLiveQuery(
    db
      .select()
      .from(healthLogs)
      .innerJoin(animals, eq(healthLogs.animalId, animals.id))
      .where(and(isNotNull(healthLogs.withdrawalEndDate), gte(healthLogs.withdrawalEndDate, today)))
      .orderBy(healthLogs.withdrawalEndDate),
  );

  const { data: upcomingDue } = useLiveQuery(
    db
      .select()
      .from(breedingEvents)
      .innerJoin(animals, eq(breedingEvents.animalId, animals.id))
      .where(and(isNotNull(breedingEvents.expectedDueDate), gte(breedingEvents.expectedDueDate, today)))
      .orderBy(breedingEvents.expectedDueDate)
      .limit(5),
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

  const recentActivity = [
    ...(recentBreeding ?? []).map((row) => ({
      key: `breeding-${row.breeding_events.id}`,
      date: row.breeding_events.createdAt,
      tag: row.animals.tagNumber,
      species: row.animals.species,
      text: `${row.breeding_events.eventType.replace(/_/g, ' ')}`,
    })),
    ...(recentHealth ?? []).map((row) => ({
      key: `health-${row.health_logs.id}`,
      date: row.health_logs.createdAt,
      tag: row.animals.tagNumber,
      species: row.animals.species,
      text: `Treated for ${row.health_logs.conditionTreated}`,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

  return (
    <ScreenContainer fab={<Fab label="Log" onPress={() => router.push('/log')} />}>
      <View>
        <Text className="text-2xl font-bold text-ink-900">HerdCare</Text>
        <Text className="text-base text-ink-500">{formatDateForDisplay(today)}</Text>
      </View>

      <View className="flex-row gap-3">
        <Card className="flex-1 items-center gap-1">
          <Text className="text-2xl font-bold text-brand-600">{activeAnimals?.length ?? 0}</Text>
          <Text className="text-sm text-ink-500">Active animals</Text>
        </Card>
        <Card className="flex-1 items-center gap-1">
          <Text className="text-2xl font-bold text-warning-500">{inWithdrawal?.length ?? 0}</Text>
          <Text className="text-sm text-ink-500">In withdrawal</Text>
        </Card>
        <Card className="flex-1 items-center gap-1">
          <Text className="text-2xl font-bold text-brand-600">{upcomingDue?.length ?? 0}</Text>
          <Text className="text-sm text-ink-500">Due soon</Text>
        </Card>
      </View>

      {upcomingDue && upcomingDue.length > 0 ? (
        <View className="gap-2">
          <Text className="text-lg font-semibold text-ink-900">Upcoming due dates</Text>
          {upcomingDue.map((row) => {
            const days = daysFromToday(row.breeding_events.expectedDueDate);
            return (
              <Card key={row.breeding_events.id} className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Text className="text-2xl">{SPECIES_EMOJI[row.animals.species]}</Text>
                  <View>
                    <Text className="text-base font-semibold text-ink-900">{row.animals.tagNumber}</Text>
                    <Text className="text-sm text-ink-500">{formatDateForDisplay(row.breeding_events.expectedDueDate)}</Text>
                  </View>
                </View>
                <Text className="text-sm font-semibold text-brand-600">
                  {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                </Text>
              </Card>
            );
          })}
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-lg font-semibold text-ink-900">Recent activity</Text>
        {recentActivity.length === 0 ? (
          <EmptyState icon="time-outline" title="No activity yet" description="Logged events will show up here." />
        ) : (
          recentActivity.map((item) => (
            <Card key={item.key} className="flex-row items-center gap-3">
              <Text className="text-2xl">{SPECIES_EMOJI[item.species]}</Text>
              <View className="flex-1">
                <Text className="text-base font-medium capitalize text-ink-900">{item.text}</Text>
                <Text className="text-sm text-ink-500">
                  {item.tag} · {formatDateForDisplay(item.date)}
                </Text>
              </View>
            </Card>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}
