import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Switches between views of the same thing — the tabs on an animal's record, for instance.
 * Distinct from a filter chip (which narrows a list) and a select (which is form input);
 * previously all three shared one look, which left everything with equal visual weight.
 */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View className="flex-row rounded-field bg-sunken p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className="min-h-[40px] flex-1 items-center justify-center rounded-[10px]"
          >
            {selected ? (
              <Animated.View
                entering={FadeIn.duration(120)}
                className="absolute inset-0 rounded-[10px] bg-raised"
                style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }}
              />
            ) : null}
            <Text
              numberOfLines={1}
              className={`text-callout ${selected ? 'font-sans-semibold text-primary' : 'font-sans-medium text-secondary'}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface FilterChipsProps<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Narrows a list. Scrolls horizontally so long option sets never wrap into a wall of pills. */
export function FilterChips<T extends string>({ options, value, onChange }: FilterChipsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 pr-4"
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`h-10 items-center justify-center rounded-pill border px-4 ${
              selected ? 'border-brand bg-brand' : 'border-line bg-surface active:bg-sunken'
            }`}
          >
            <Text className={`text-callout font-sans-medium ${selected ? 'text-on-brand' : 'text-secondary'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
