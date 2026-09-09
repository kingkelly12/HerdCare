import { Text, View } from 'react-native';
import type { AnimalStatus } from '@/db/schema';
import { STATUS_META } from './speciesMeta';

export function StatusBadge({ status }: { status: AnimalStatus }) {
  const meta = STATUS_META[status];
  return (
    <View className={`self-start rounded-pill px-2.5 py-1 ${meta.container}`}>
      <Text className={`text-caption font-sans-semibold uppercase ${meta.text}`}>{meta.label}</Text>
    </View>
  );
}
