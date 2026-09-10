import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import {
  expectedHatchDate,
  fertilityRate,
  hatchOfFertile,
  hatchOfSet,
  hatchStage,
  hatchVerdict,
  incubationDay,
} from '@/db/hatches';
import { flocks, hatchBatches } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { daysFromToday, formatDateForDisplay } from '@/utils/livestockRules';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'poor' }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text className={`text-headline font-sans-bold ${tone === 'poor' ? 'text-warn' : 'text-primary'}`}>{value}</Text>
      <Text className="text-label text-tertiary">{label}</Text>
    </View>
  );
}

export default function HatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const { data: rows } = useLiveQuery(db.select().from(hatchBatches).where(eq(hatchBatches.id, id)), [id]);
  const batch = rows?.[0];

  const { data: flockRows } = useLiveQuery(
    db.select().from(flocks).where(eq(flocks.id, batch?.sourceFlockId ?? '')),
    [batch?.sourceFlockId],
  );
  const sourceFlock = flockRows?.[0];

  if (!batch) {
    return (
      <ScreenContainer>
        <EmptyState icon="egg-outline" title="Batch not found" />
      </ScreenContainer>
    );
  }

  const stage = hatchStage(batch);
  const day = incubationDay(batch);
  const hatchDate = expectedHatchDate(batch);
  const daysLeft = daysFromToday(hatchDate) ?? 0;
  const fertility = fertilityRate(batch);
  const ofSet = hatchOfSet(batch);
  const ofFertile = hatchOfFertile(batch);
  const verdict = hatchVerdict(batch);

  function confirmDelete() {
    Alert.alert('Delete this batch?', 'The record of these eggs and their hatch will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await db.delete(hatchBatches).where(eq(hatchBatches.id, id));
          refreshRemindersAndNotifications().catch(() => {});
          router.dismissAll();
          router.replace('/animals');
        },
      },
    ]);
  }

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-2">
        <View className="h-20 w-20 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name="egg" size={34} color={colors.brand} />
        </View>
        <Text className="text-title font-sans-bold text-primary">{batch.eggsSet} eggs</Text>
        <Text className="text-callout text-secondary">Set {formatDateForDisplay(batch.setDate)}</Text>
        {sourceFlock ? <Text className="text-label text-tertiary">From {sourceFlock.name}</Text> : null}
      </Animated.View>

      {stage !== 'complete' ? (
        <Animated.View entering={FadeInDown.duration(280).delay(60)}>
          <Surface level="raised" className="gap-2 p-4">
            <Text className="text-headline font-sans-semibold text-primary">
              Day {day} of {batch.incubationDays}
            </Text>
            <Text className="text-callout text-secondary">
              {stage === 'due'
                ? `Hatch was due ${formatDateForDisplay(hatchDate)}. Record what hatched once they are dry.`
                : `Due to hatch ${formatDateForDisplay(hatchDate)} — ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go.`}
            </Text>
            {day >= batch.incubationDays - 3 && stage !== 'due' ? (
              <View className="mt-1 rounded-field bg-warn-soft px-3 py-2">
                <Text className="text-label font-sans-semibold text-warn">
                  Lockdown — keep the incubator shut and the humidity up until they hatch.
                </Text>
              </View>
            ) : null}
          </Surface>
        </Animated.View>
      ) : null}

      {(fertility !== null || ofSet !== null) ? (
        <Animated.View entering={FadeInDown.duration(280).delay(90)}>
          <Surface level="raised" className="gap-3 p-4">
            <Text className="text-headline font-sans-semibold text-primary">How it went</Text>
            <View className="flex-row">
              {fertility !== null ? (
                <Metric label="Fertile" value={`${Math.round(fertility)}%`} tone={fertility < 70 ? 'poor' : 'good'} />
              ) : null}
              {ofSet !== null ? <Metric label="Hatched of set" value={`${Math.round(ofSet)}%`} /> : null}
              {ofFertile !== null ? (
                <Metric label="Of fertile" value={`${Math.round(ofFertile)}%`} tone={ofFertile < 70 ? 'poor' : 'good'} />
              ) : null}
            </View>
            {verdict ? <Text className="border-t border-line pt-3 text-callout text-secondary">{verdict}</Text> : null}
          </Surface>
        </Animated.View>
      ) : null}

      <View className="gap-2">
        {batch.candledDate ? (
          <Surface level="raised" className="flex-row items-center gap-3 p-4">
            <Ionicons name="flashlight-outline" size={20} color={colors.secondary} />
            <Text className="flex-1 text-callout text-secondary">
              Candled {formatDateForDisplay(batch.candledDate)} · {batch.fertileEggs} of {batch.eggsSet} developing
            </Text>
          </Surface>
        ) : (
          <Button label="Record candling" variant="secondary" fullWidth onPress={() => router.push(`/hatch/${id}/candle`)} />
        )}

        {batch.hatchedDate ? (
          <Surface level="raised" className="flex-row items-center gap-3 p-4">
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.brand} />
            <View className="flex-1">
              <Text className="text-callout text-secondary">
                Hatched {formatDateForDisplay(batch.hatchedDate)} · {batch.chicksHatched} chicks
              </Text>
              {batch.resultingFlockId ? (
                <Text className="text-label text-brand" onPress={() => router.push(`/flock/${batch.resultingFlockId}`)}>
                  View their flock
                </Text>
              ) : null}
            </View>
          </Surface>
        ) : (
          <Button label="Record the hatch" fullWidth onPress={() => router.push(`/hatch/${id}/hatch`)} />
        )}

        <Button label="Delete this batch" variant="ghost" fullWidth onPress={confirmDelete} />
      </View>

      <View className="h-8" />
    </ScreenContainer>
  );
}
