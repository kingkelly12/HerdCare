import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/theme/colors';

type Tone = 'brand' | 'warn' | 'earth';

const TONE: Record<Tone, { container: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  brand: { container: 'bg-brand-soft', text: 'text-brand', icon: 'calendar' },
  warn: { container: 'bg-warn-soft', text: 'text-warn', icon: 'alert-circle' },
  earth: { container: 'bg-earth-soft', text: 'text-earth', icon: 'repeat' },
};

/**
 * Surfaces a value the app worked out for the farmer — a due date, a withdrawal end. Shown as a
 * tinted band rather than another card, so it reads as an answer rather than another input.
 */
export function Callout({ tone = 'brand', children }: { tone?: Tone; children: string }) {
  const colors = useColors();
  const meta = TONE[tone];
  const iconColor = tone === 'warn' ? colors.warn : tone === 'earth' ? colors.earth : colors.brand;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      className={`flex-row items-center gap-2.5 rounded-field px-4 py-3 ${meta.container}`}
    >
      <Ionicons name={meta.icon} size={20} color={iconColor} />
      <Text className={`flex-1 text-callout font-sans-semibold ${meta.text}`}>{children}</Text>
    </Animated.View>
  );
}
