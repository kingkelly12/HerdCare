import { Text, View } from 'react-native';
import type { AnimalStatus } from '@/db/schema';
import { STATUS_META } from './speciesMeta';

export function StatusBadge({ status }: { status: AnimalStatus }) {
  const meta = STATUS_META[status];
  return (
    <View className={`self-start rounded-full px-3 py-1 ${meta.className}`}>
      <Text className={`text-sm font-semibold ${meta.className}`}>{meta.label}</Text>
    </View>
  );
}
