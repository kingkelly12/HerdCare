import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { useColors } from '@/theme/colors';

interface TextFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

export function TextField({ label, required, error, hint, className, onFocus, onBlur, ...props }: TextFieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  const borderClass = error ? 'border-danger' : focused ? 'border-brand' : 'border-line';

  return (
    <View className="gap-2">
      <Text className="text-label font-sans-semibold uppercase text-tertiary">
        {label}
        {required ? <Text className="text-danger"> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={colors.tertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={`min-h-touch rounded-field border bg-surface px-4 py-3 text-body font-sans text-primary ${borderClass} ${
          className ?? ''
        }`}
        {...props}
      />
      {error ? <Text className="text-label text-danger">{error}</Text> : null}
      {hint && !error ? <Text className="text-label text-tertiary">{hint}</Text> : null}
    </View>
  );
}
