import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

export function Card({ className, ...props }: ViewProps) {
  return <View className={`rounded-2xl border border-ink-100 bg-white p-4 ${className ?? ''}`} {...props} />;
}

export function PressableCard({ className, ...props }: PressableProps) {
  return (
    <Pressable
      className={`rounded-2xl border border-ink-100 bg-white p-4 ${className ?? ''}`}
      style={({ pressed }) => (pressed ? { backgroundColor: '#E4E9E1' } : undefined)}
      {...props}
    />
  );
}
