import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PressableSurface } from '@/components/ui/Surface';
import { useColors } from '@/theme/colors';
import { formatMoney } from '@/utils/money';
import { readCachedPipeline } from '@/lib/agent/followUps';

/**
 * One line on Today for an agent, and only when there is something to act on: farmers whose free
 * trial or payment is due this month, or news since they last opened their portal. Most days it
 * is not there at all, which is what keeps it worth reading when it is.
 *
 * Reads the list saved at launch, so it costs no network and appears instantly.
 */
export function AgentTodayCard() {
  const colors = useColors();
  const [summary, setSummary] = useState<{ due: number; news: string | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      const cache = readCachedPipeline();
      if (!cache) {
        setSummary(null);
        return;
      }
      const { farmers, events, currency } = cache.pipeline;
      const due = farmers.filter((f) => f.stage === 'trial-ending' || f.stage === 'renewal-due').length;
      const newPayments = events.filter(
        (e) => (e.kind === 'first-payment' || e.kind === 'renewed') && (!cache.seenAt || e.at > cache.seenAt),
      );
      const earned = newPayments.reduce((sum, e) => sum + (e.earned ?? 0), 0);
      const news = newPayments.length > 0 ? `${formatMoney(earned, currency)} earned since you last looked` : null;
      setSummary(due > 0 || news ? { due, news } : null);
    }, []),
  );

  if (!summary) return null;

  const headline =
    summary.due > 0
      ? `${summary.due} farmer${summary.due === 1 ? '' : 's'} to follow up this month`
      : 'Your farmers';

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(40)}>
      <PressableSurface level="raised" onPress={() => router.push('/agent' as any)} className="flex-row items-center gap-3 p-4">
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name="people" size={20} color={colors.brand} />
        </View>
        <View className="flex-1">
          <Text className="text-callout font-sans-semibold text-primary">{headline}</Text>
          <Text className="text-label text-secondary">{summary.news ?? 'Free trials ending and payments due'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
      </PressableSurface>
    </Animated.View>
  );
}
