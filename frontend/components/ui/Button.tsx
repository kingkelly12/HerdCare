import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const VARIANT_STYLES: Record<Variant, { container: string; text: string; pressed: string }> = {
  primary: { container: 'bg-brand-500', text: 'text-white', pressed: 'bg-brand-600' },
  secondary: { container: 'bg-white border-2 border-brand-500', text: 'text-brand-600', pressed: 'bg-brand-50' },
  danger: { container: 'bg-danger-500', text: 'text-white', pressed: 'bg-danger-600' },
  ghost: { container: 'bg-transparent', text: 'text-ink-700', pressed: 'bg-ink-100' },
};

export function Button({ label, variant = 'primary', loading, fullWidth, icon, disabled, ...props }: ButtonProps) {
  const styles = VARIANT_STYLES[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      className={`min-h-touch flex-row items-center justify-center gap-2 rounded-2xl px-6 ${
        fullWidth ? 'w-full' : ''
      } ${styles.container} ${disabled || loading ? 'opacity-50' : ''}`}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#2C7A3D'} />
      ) : (
        <>
          {icon}
          <Text className={`text-lg font-semibold ${styles.text}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
