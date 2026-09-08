import { Pressable, Text, View } from 'react-native';

interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipGroupProps<T extends string> {
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: boolean;
}

export function ChipGroup<T extends string>({ options, value, onChange, columns }: ChipGroupProps<T>) {
  return (
    <View className={`flex-row flex-wrap gap-2 ${columns ? '' : ''}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`min-h-touch items-center justify-center rounded-full border-2 px-5 ${
              selected ? 'border-brand-500 bg-brand-500' : 'border-ink-100 bg-white'
            }`}
          >
            <Text className={`text-base font-medium ${selected ? 'text-white' : 'text-ink-700'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
