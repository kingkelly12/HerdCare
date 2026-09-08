import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableCard } from '@/components/ui/Card';
import type { Animal } from '@/db/schema';
import { SPECIES_EMOJI } from './speciesMeta';

interface SelectedAnimalFieldProps {
  label: string;
  animal: Animal | null;
  onPress: () => void;
  required?: boolean;
}

export function SelectedAnimalField({ label, animal, onPress, required }: SelectedAnimalFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-base font-medium text-ink-700">
        {label}
        {required ? <Text className="text-danger-500"> *</Text> : null}
      </Text>
      <PressableCard onPress={onPress} className="flex-row items-center justify-between">
        {animal ? (
          <View className="flex-row items-center gap-3">
            <Text className="text-2xl">{SPECIES_EMOJI[animal.species]}</Text>
            <View>
              <Text className="text-lg font-semibold text-ink-900">{animal.tagNumber}</Text>
              {animal.name ? <Text className="text-sm text-ink-500">{animal.name}</Text> : null}
            </View>
          </View>
        ) : (
          <Text className="text-lg text-ink-500">Tap to select an animal</Text>
        )}
        <Ionicons name="chevron-forward" size={22} color="#5C6B58" />
      </PressableCard>
    </View>
  );
}
