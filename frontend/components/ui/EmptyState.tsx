import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <View className="items-center justify-center gap-2 py-16">
      <Ionicons name={icon} size={48} color="#94A190" />
      <Text className="text-lg font-semibold text-ink-700">{title}</Text>
      {description ? <Text className="max-w-xs text-center text-base text-ink-500">{description}</Text> : null}
    </View>
  );
}
