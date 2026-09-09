import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PressableSurface } from '@/components/ui/Surface';
import type { Animal } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { SpeciesAvatar } from './SpeciesIcon';
import { StatusBadge } from './StatusBadge';

interface AnimalListItemProps {
  animal: Animal;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  /** Position in the list, used to stagger the entrance. */
  index?: number;
}

export function AnimalListItem({ animal, onPress, onLongPress, selected, selectionMode, index = 0 }: AnimalListItemProps) {
  const colors = useColors();

  return (
    <Animated.View
      // Capped so rows far down a long herd list still appear promptly.
      entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}
    >
      <PressableSurface
        onPress={onPress}
        onLongPress={onLongPress}
        level={selected ? 'floating' : 'raised'}
        className={`flex-row items-center gap-3 p-3 ${selected ? 'border-brand' : ''}`}
      >
        {selectionMode ? (
          <View className="h-11 w-11 items-center justify-center">
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={28}
              color={selected ? colors.brand : colors.tertiary}
            />
          </View>
        ) : (
          <SpeciesAvatar species={animal.species} size={22} tone={animal.status === 'in_withdrawal' ? 'warn' : 'default'} />
        )}

        <View className="flex-1 gap-0.5">
          <View className="flex-row items-baseline gap-2">
            <Text className="text-body font-sans-semibold text-primary">{animal.tagNumber}</Text>
            {animal.name ? (
              <Text numberOfLines={1} className="flex-1 text-callout text-secondary">
                {animal.name}
              </Text>
            ) : null}
          </View>
          <Text className="text-label capitalize text-tertiary">
            {animal.breed ? `${animal.breed} · ` : ''}
            {animal.species} · {animal.gender}
          </Text>
        </View>

        <StatusBadge status={animal.status} />
      </PressableSurface>
    </Animated.View>
  );
}
