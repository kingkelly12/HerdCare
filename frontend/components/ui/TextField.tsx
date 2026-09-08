import { Text, TextInput, View, type TextInputProps } from 'react-native';

interface TextFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  error?: string;
}

export function TextField({ label, required, error, className, ...props }: TextFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-base font-medium text-ink-700">
        {label}
        {required ? <Text className="text-danger-500"> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor="#94A190"
        className={`min-h-touch rounded-xl border-2 bg-white px-4 py-3 text-lg text-ink-900 ${
          error ? 'border-danger-400' : 'border-ink-100'
        } ${className ?? ''}`}
        {...props}
      />
      {error ? <Text className="text-sm text-danger-500">{error}</Text> : null}
    </View>
  );
}
