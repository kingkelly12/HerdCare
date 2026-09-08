import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { QUICK_DATE_OPTIONS, formatDateForDisplay, getRelativeDateIso, isSameDayAsOffset } from '@/utils/livestockRules';

interface QuickDateSelectorProps {
  label: string;
  valueIso: string;
  onChange: (iso: string) => void;
  /** Adds an "Unknown" chip that clears the value to an empty string. */
  allowUnknown?: boolean;
}

export function QuickDateSelector({ label, valueIso, onChange, allowUnknown }: QuickDateSelectorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isUnknown = valueIso === '';
  const matchesQuickOption = !isUnknown && QUICK_DATE_OPTIONS.some((option) => isSameDayAsOffset(valueIso, option.offsetDays));

  return (
    <View className="gap-1.5">
      <Text className="text-base font-medium text-ink-700">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {allowUnknown ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isUnknown }}
            onPress={() => onChange('')}
            className={`min-h-touch items-center justify-center rounded-full border-2 px-4 ${
              isUnknown ? 'border-brand-500 bg-brand-500' : 'border-ink-100 bg-white'
            }`}
          >
            <Text className={`text-base font-medium ${isUnknown ? 'text-white' : 'text-ink-700'}`}>Unknown</Text>
          </Pressable>
        ) : null}
        {QUICK_DATE_OPTIONS.map((option) => {
          const selected = !isUnknown && isSameDayAsOffset(valueIso, option.offsetDays);
          return (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(getRelativeDateIso(option.offsetDays))}
              className={`min-h-touch items-center justify-center rounded-full border-2 px-4 ${
                selected ? 'border-brand-500 bg-brand-500' : 'border-ink-100 bg-white'
              }`}
            >
              <Text className={`text-base font-medium ${selected ? 'text-white' : 'text-ink-700'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !matchesQuickOption }}
          onPress={() => setPickerOpen(true)}
          className={`min-h-touch items-center justify-center rounded-full border-2 px-4 ${
            !matchesQuickOption ? 'border-brand-500 bg-brand-500' : 'border-ink-100 bg-white'
          }`}
        >
          <Text className={`text-base font-medium ${!matchesQuickOption ? 'text-white' : 'text-ink-700'}`}>
            {!matchesQuickOption ? formatDateForDisplay(valueIso) : 'Pick date'}
          </Text>
        </Pressable>
      </View>
      {pickerOpen ? (
        <DateTimePicker
          value={isUnknown ? new Date() : new Date(valueIso)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
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
