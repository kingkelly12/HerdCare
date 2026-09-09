import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableSurface } from '@/components/ui/Surface';
import type { Animal } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { SpeciesAvatar } from './SpeciesIcon';

interface SelectedAnimalFieldProps {
  label: string;
  animal: Animal | null;
  onPress: () => void;
  required?: boolean;
}

export function SelectedAnimalField({ label, animal, onPress, required }: SelectedAnimalFieldProps) {
  const colors = useColors();

  return (
    <View className="gap-2">
      <Text className="text-label font-sans-semibold uppercase text-tertiary">
        {label}
        {required ? <Text className="text-danger"> *</Text> : null}
      </Text>
      <PressableSurface
        onPress={onPress}
        className={`min-h-touch flex-row items-center justify-between p-3 ${animal ? 'border-brand' : ''}`}
      >
        {animal ? (
          <View className="flex-row items-center gap-3">
            <SpeciesAvatar species={animal.species} size={20} />
            <View>
              <Text className="text-body font-sans-semibold text-primary">{animal.tagNumber}</Text>
              {animal.name ? <Text className="text-label text-tertiary">{animal.name}</Text> : null}
            </View>
          </View>
        ) : (
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-pill bg-sunken">
              <Ionicons name="search" size={18} color={colors.tertiary} />
            </View>
            <Text className="text-body text-tertiary">Tap to choose</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
      </PressableSurface>
    </View>
  );
}
