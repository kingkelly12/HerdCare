import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableCard } from '@/components/ui/Card';
import type { Animal } from '@/db/schema';
import { SPECIES_EMOJI } from './speciesMeta';
import { StatusBadge } from './StatusBadge';

interface AnimalListItemProps {
  animal: Animal;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
}

export function AnimalListItem({ animal, onPress, onLongPress, selected, selectionMode }: AnimalListItemProps) {
  return (
    <PressableCard onPress={onPress} onLongPress={onLongPress} className="flex-row items-center gap-3">
      {selectionMode ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={28}
          color={selected ? '#2C7A3D' : '#94A190'}
        />
      ) : (
        <Text className="text-3xl">{SPECIES_EMOJI[animal.species]}</Text>
      )}
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-semibold text-ink-900">{animal.tagNumber}</Text>
          {animal.name ? <Text className="text-base text-ink-500">· {animal.name}</Text> : null}
        </View>
        <Text className="text-sm capitalize text-ink-500">
          {animal.breed ? `${animal.breed} ` : ''}
          {animal.species} · {animal.gender}
        </Text>
      </View>
      <StatusBadge status={animal.status} />
    </PressableCard>
  );
}
