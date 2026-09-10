import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { PressableSurface } from '@/components/ui/Surface';
import { useColors } from '@/theme/colors';

export default function MoneyChooserScreen() {
  const colors = useColors();

  const options = [
    {
      path: '/income/new' as const,
      icon: 'arrow-down-circle' as const,
      title: 'Money in',
      description: 'An animal sold, eggs, manure, a stud fee',
      tint: colors.brand,
      background: 'bg-brand-soft',
    },
    {
      path: '/expense/new' as const,
      icon: 'arrow-up-circle' as const,
      title: 'Money out',
      description: 'Feed, vet, labour, transport, AI',
      tint: colors.danger,
      background: 'bg-danger-soft',
    },
  ];

  return (
    <ScreenContainer>
      <Text className="pt-2 text-callout text-secondary">What would you like to record?</Text>
      {options.map((option, i) => (
        <Animated.View key={option.path} entering={FadeInDown.duration(260).delay(i * 50)}>
          <PressableSurface
            onPress={() => router.replace(option.path)}
            className="min-h-touch flex-row items-center gap-4 p-4"
          >
            <View className={`h-12 w-12 items-center justify-center rounded-pill ${option.background}`}>
              <Ionicons name={option.icon} size={24} color={option.tint} />
            </View>
            <View className="flex-1">
              <Text className="text-body font-sans-semibold text-primary">{option.title}</Text>
              <Text className="text-label text-tertiary">{option.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
          </PressableSurface>
        </Animated.View>
      ))}
    </ScreenContainer>
  );
}
