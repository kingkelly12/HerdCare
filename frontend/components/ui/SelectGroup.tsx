import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/theme/colors';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading mark, e.g. a species icon. */
  icon?: ReactNode;
}

interface SelectGroupProps<T extends string> {
  label: string;
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  required?: boolean;
  /** Wraps options into a grid of large targets instead of a single row. */
  columns?: number;
}

/**
 * Form input for choosing one of a handful of values — species, gender, delivery type.
 *
 * Targets are deliberately tall and the selection is marked with both colour and a tick, so it
 * survives glare and a screen the farmer cannot look at closely.
 */
export function SelectGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  required,
  columns = 2,
}: SelectGroupProps<T>) {
  const colors = useColors();
  const widthClass = columns === 2 ? 'w-[48%]' : columns === 3 ? 'w-[31%]' : 'w-full';

  return (
    <View className="gap-2">
      <Text className="text-label font-sans-semibold uppercase text-tertiary">
        {label}
        {required ? <Text className="text-danger"> *</Text> : null}
      </Text>
      <View className="flex-row flex-wrap justify-between gap-y-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              className={`${widthClass} min-h-touch flex-row items-center gap-2 rounded-field border px-3 py-3 ${
                selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface active:bg-sunken'
              }`}
            >
              {option.icon}
              <Text
                numberOfLines={1}
                className={`flex-1 text-body ${selected ? 'font-sans-semibold text-primary' : 'font-sans-medium text-secondary'}`}
              >
                {option.label}
              </Text>
              {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
