import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { PressableSurface } from '@/components/ui/Surface';
import { useColors } from '@/theme/colors';

const ACTIONS: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  path: '/log/milk' | '/log/breeding' | '/log/health' | '/log/birth';
}[] = [
  // Milking is first: it is the only one of these a dairy farmer does twice every single day.
  { icon: 'water', title: 'Milking', description: 'Litres per animal, and what they earned', path: '/log/milk' },
  { icon: 'heart', title: 'Breeding event', description: 'Heat, service, weaning', path: '/log/breeding' },
  { icon: 'medkit', title: 'Health treatment', description: 'Medication, withdrawal period', path: '/log/health' },
  { icon: 'egg', title: 'Birth record', description: 'Offspring count, delivery type', path: '/log/birth' },
];

export default function LogPickerScreen() {
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();
  const colors = useColors();

  return (
    <ScreenContainer>
      <Text className="pt-2 text-callout text-secondary">What would you like to log?</Text>

      {ACTIONS.map((action, i) => (
        <Animated.View key={action.path} entering={FadeInDown.duration(260).delay(i * 50)}>
          <PressableSurface
            // `replace`, not `push`: this chooser hands off to the form rather than stacking
            // beneath it, so saving (a single `router.back()`) returns the farmer to the screen
            // they started from instead of stranding them back on this list.
            onPress={() => router.replace(animalId ? `${action.path}?animalId=${animalId}` : action.path)}
            className="min-h-touch flex-row items-center gap-4 p-4"
          >
            <View className="h-12 w-12 items-center justify-center rounded-pill bg-brand-soft">
              <Ionicons name={action.icon} size={24} color={colors.brand} />
            </View>
            <View className="flex-1">
              <Text className="text-body font-sans-semibold text-primary">{action.title}</Text>
              <Text className="text-label text-tertiary">{action.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
          </PressableSurface>
        </Animated.View>
      ))}

      {!animalId ? (
        <Animated.View entering={FadeInDown.duration(260).delay(150)}>
          <PressableSurface onPress={() => router.replace('/animal/new')} className="min-h-touch flex-row items-center gap-4 p-4">
            <View className="h-12 w-12 items-center justify-center rounded-pill bg-earth-soft">
              <Ionicons name="add" size={24} color={colors.earth} />
            </View>
            <View className="flex-1">
              <Text className="text-body font-sans-semibold text-primary">Register new animal</Text>
              <Text className="text-label text-tertiary">Add a new animal to the herd</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
          </PressableSurface>
        </Animated.View>
      ) : null}
    </ScreenContainer>
  );
}
