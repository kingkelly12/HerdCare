import { FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { PressableSurface } from '@/components/ui/Surface';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { expectedHatchDate, hatchOfSet, hatchStage, incubationDay } from '@/db/hatches';
import { hatchBatches } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { daysFromToday, formatDateForDisplay } from '@/utils/livestockRules';

export function HatchList({ header }: { header: React.ReactNode }) {
  const colors = useColors();
  const { data: rows } = useLiveQuery(db.select().from(hatchBatches).orderBy(desc(hatchBatches.setDate)));

  return (
    <ScreenContainer scroll={false} fab={<Fab onPress={() => router.push('/hatch/new')} label="Set eggs" />}>
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
            title="Nothing in the incubator"
            description="Set a batch of eggs and the app will remind you when to candle, lock down and expect the hatch."
          />
        }
        renderItem={({ item, index }) => {
          const stage = hatchStage(item);
          const day = incubationDay(item);
          const daysLeft = daysFromToday(expectedHatchDate(item)) ?? 0;
          const result = hatchOfSet(item);

          const status =
            stage === 'complete'
              ? `${item.chicksHatched} hatched${result !== null ? ` · ${Math.round(result)}%` : ''}`
              : stage === 'due'
                ? 'Hatch due now'
                : `Day ${day} of ${item.incubationDays} · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go`;

          return (
            <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}>
              <PressableSurface
                onPress={() => router.push(`/hatch/${item.id}`)}
                className={`flex-row items-center gap-3 p-3 ${stage === 'complete' ? 'opacity-70' : ''}`}
              >
                <View
                  className={`h-12 w-12 items-center justify-center rounded-pill ${
                    stage === 'due' ? 'bg-warn-soft' : 'bg-brand-soft'
                  }`}
                >
                  <Ionicons name="egg" size={22} color={stage === 'due' ? colors.warn : colors.brand} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-body font-sans-semibold text-primary">{item.eggsSet} eggs</Text>
                  <Text className="text-label text-tertiary">
                    Set {formatDateForDisplay(item.setDate)} · {status}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
              </PressableSurface>
            </Animated.View>
          );
        }}
      />
    </ScreenContainer>
  );
}
