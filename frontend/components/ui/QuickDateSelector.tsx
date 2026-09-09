import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useColors, useIsDark } from '@/theme/colors';
import {
  QUICK_DATE_OPTIONS,
  QUICK_FUTURE_DATE_OPTIONS,
  formatDateForDisplay,
  getRelativeDateIso,
  isSameDayAsOffset,
} from '@/utils/livestockRules';

interface QuickDateSelectorProps {
  label: string;
  valueIso: string;
  onChange: (iso: string) => void;
  /** Adds an "Unknown" chip that clears the value to an empty string. */
  allowUnknown?: boolean;
  /**
   * 'past' (the default) is for recording something that already happened and refuses future
   * dates; 'future' is for scheduling and refuses past ones.
   */
  direction?: 'past' | 'future';
}

function DateChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-11 items-center justify-center rounded-pill border px-4 ${
        selected ? 'border-brand bg-brand' : 'border-line bg-surface active:bg-sunken'
      }`}
    >
      <Text className={`text-callout font-sans-medium ${selected ? 'text-on-brand' : 'text-secondary'}`}>{label}</Text>
    </Pressable>
  );
}

export function QuickDateSelector({ label, valueIso, onChange, allowUnknown, direction = 'past' }: QuickDateSelectorProps) {
  const colors = useColors();
  const isDark = useIsDark();
  const [pickerOpen, setPickerOpen] = useState(false);
  const isUnknown = valueIso === '';
  const options = direction === 'future' ? QUICK_FUTURE_DATE_OPTIONS : QUICK_DATE_OPTIONS;
  const matchesQuickOption = !isUnknown && options.some((option) => isSameDayAsOffset(valueIso, option.offsetDays));

  return (
    <View className="gap-2">
      <Text className="text-label font-sans-semibold uppercase text-tertiary">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {allowUnknown ? <DateChip label="Unknown" selected={isUnknown} onPress={() => onChange('')} /> : null}
        {options.map((option) => (
          <DateChip
            key={option.label}
            label={option.label}
            selected={!isUnknown && isSameDayAsOffset(valueIso, option.offsetDays)}
            onPress={() => onChange(getRelativeDateIso(option.offsetDays))}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !matchesQuickOption && !isUnknown }}
          onPress={() => setPickerOpen(true)}
          className={`h-11 flex-row items-center gap-1.5 rounded-pill border px-4 ${
            !matchesQuickOption && !isUnknown ? 'border-brand bg-brand' : 'border-line bg-surface active:bg-sunken'
          }`}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={!matchesQuickOption && !isUnknown ? colors.onBrand : colors.secondary}
          />
          <Text
            className={`text-callout font-sans-medium ${
              !matchesQuickOption && !isUnknown ? 'text-on-brand' : 'text-secondary'
            }`}
          >
            {!matchesQuickOption && !isUnknown ? formatDateForDisplay(valueIso) : 'Pick date'}
          </Text>
        </Pressable>
      </View>
      {pickerOpen ? (
        <DateTimePicker
          value={isUnknown ? new Date() : new Date(valueIso)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          themeVariant={isDark ? 'dark' : 'light'}
          maximumDate={direction === 'past' ? new Date() : undefined}
          minimumDate={direction === 'future' ? new Date() : undefined}
          onChange={(event, date) => {
            setPickerOpen(Platform.OS === 'ios');
            if (event.type === 'set' && date) {
              onChange(date.toISOString());
            }
          }}
        />
      ) : null}
    </View>
  );
}
