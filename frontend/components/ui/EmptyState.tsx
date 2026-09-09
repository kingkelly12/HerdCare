import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/theme/colors';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const colors = useColors();
  return (
    <Animated.View entering={FadeInDown.duration(320)} className="items-center justify-center gap-3 py-16">
      <View className="h-20 w-20 items-center justify-center rounded-pill bg-brand-soft">
        <Ionicons name={icon} size={36} color={colors.brand} />
      </View>
      <Text className="text-headline font-sans-semibold text-primary">{title}</Text>
      {description ? (
        <Text className="max-w-[280px] text-center text-callout text-secondary">{description}</Text>
      ) : null}
    </Animated.View>
  );
}
