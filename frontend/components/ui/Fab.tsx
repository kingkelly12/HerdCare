import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface FabProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
}

export function Fab({ onPress, icon = 'add', label }: FabProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Add'}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      className="absolute bottom-6 right-6 h-16 flex-row items-center justify-center gap-2 rounded-full bg-brand-500 px-5 shadow-lg"
      style={({ pressed }) => [
        { elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
        pressed ? { opacity: 0.85 } : undefined,
      ]}
    >
      <Ionicons name={icon} size={28} color="#fff" />
      {label ? <Text className="text-lg font-semibold text-white">{label}</Text> : null}
    </Pressable>
  );
}
