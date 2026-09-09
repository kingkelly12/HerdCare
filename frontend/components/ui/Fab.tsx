import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/theme/colors';

interface FabProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
}

export function Fab({ onPress, icon = 'add', label }: FabProps) {
  const colors = useColors();

  return (
    <Animated.View entering={FadeInDown.springify().damping(16).delay(120)} className="absolute bottom-6 right-5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Add'}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        className="h-16 flex-row items-center justify-center gap-2 rounded-pill bg-brand px-6 active:bg-brand-strong"
        // A plain object, not a `({pressed}) => …` callback: css-interop maps className onto the
        // style prop and never invokes a function style, which would drop this elevation.
        style={{
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 5 },
        }}
      >
        <Ionicons name={icon} size={26} color={colors.onBrand} />
        {label ? <Text className="text-body font-sans-semibold text-on-brand">{label}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}
