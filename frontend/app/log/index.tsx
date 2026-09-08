import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { PressableCard } from '@/components/ui/Card';

const ACTIONS: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; path: '/log/breeding' | '/log/health' | '/log/birth' }[] = [
  { icon: 'heart', title: 'Breeding event', description: 'Heat, service, palpation, weaning', path: '/log/breeding' },
  { icon: 'medkit', title: 'Health treatment', description: 'Medication, withdrawal period', path: '/log/health' },
  { icon: 'egg', title: 'Birth record', description: 'Offspring count, delivery type', path: '/log/birth' },
];

export default function LogPickerScreen() {
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();

  return (
    <ScreenContainer>
      <Text className="text-lg text-ink-500">What would you like to log?</Text>
      {ACTIONS.map((action) => (
        <PressableCard
          key={action.path}
          onPress={() => router.push(animalId ? `${action.path}?animalId=${animalId}` : action.path)}
          className="flex-row items-center gap-4"
        >
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <Ionicons name={action.icon} size={28} color="#2C7A3D" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-ink-900">{action.title}</Text>
            <Text className="text-sm text-ink-500">{action.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#5C6B58" />
        </PressableCard>
      ))}
      {!animalId ? (
        <PressableCard onPress={() => router.push('/animal/new')} className="flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-earth-100">
            <Ionicons name="paw" size={28} color="#8C6A36" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-ink-900">Register new animal</Text>
            <Text className="text-sm text-ink-500">Add a new animal to the herd</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#5C6B58" />
        </PressableCard>
      ) : null}
    </ScreenContainer>
  );
}
