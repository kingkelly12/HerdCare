import { FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc, eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { PressableSurface } from '@/components/ui/Surface';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { currentFlockCount } from '@/db/flocks';
import { flockEvents, flocks } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { POULTRY_TYPE_META, flockAgeInDays, formatFlockAge } from '@/utils/poultryRules';

export function FlocksList({ header }: { header: React.ReactNode }) {
  const colors = useColors();

  const { data: rows } = useLiveQuery(db.select().from(flocks).orderBy(desc(flocks.acquiredDate)));

  // Every event for every flock in one read, then folded per flock in memory. A flock has tens of
  // events, not thousands, so this stays far cheaper than a query per row.
  const { data: allEvents } = useLiveQuery(db.select().from(flockEvents));
  const eventsByFlock = (allEvents ?? []).reduce<Record<string, typeof flockEvents.$inferSelect[]>>((acc, event) => {
    (acc[event.flockId] ??= []).push(event);
    return acc;
  }, {});

  return (
    <ScreenContainer scroll={false} fab={<Fab onPress={() => router.push('/flock/new')} label="Add" />}>
      <View className="gap-3 pt-4">{header}</View>

      <FlatList
        data={rows ?? []}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerClassName="gap-2 pb-32 pt-1"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="egg-outline"
            title="No flocks yet"
            description="Chickens are tracked as a flock, not one bird at a time. Tap Add to start a batch."
          />
        }
        renderItem={({ item, index }) => {
          const birds = currentFlockCount(item, eventsByFlock[item.id] ?? []);
          const closed = item.status === 'closed';
          return (
            <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}>
              <PressableSurface
                onPress={() => router.push(`/flock/${item.id}`)}
                className={`flex-row items-center gap-3 p-3 ${closed ? 'opacity-60' : ''}`}
              >
                <View className="h-12 w-12 items-center justify-center rounded-pill bg-brand-soft">
                  <Text className="text-body font-sans-bold text-brand">{birds}</Text>
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-body font-sans-semibold text-primary">{item.name}</Text>
                  <Text className="text-label text-tertiary">
                    {POULTRY_TYPE_META[item.poultryType].label}
                    {item.breed ? ` · ${item.breed}` : ''} · {formatFlockAge(flockAgeInDays(item))}
                  </Text>
                </View>
                {closed ? (
                  <View className="rounded-pill bg-sunken px-2.5 py-1">
                    <Text className="text-caption font-sans-semibold uppercase text-tertiary">Closed</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
              </PressableSurface>
            </Animated.View>
          );
        }}
      />
    </ScreenContainer>
  );
}
