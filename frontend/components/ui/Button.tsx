import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { useColors } from '@/theme/colors';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

// Press feedback rides on NativeWind's `active:` variant — css-interop maps className onto the
// style prop, so a `style={({pressed}) => …}` callback is swallowed and never called. These must
// be literal strings: Tailwind scans source text and would not generate a composed `active:${…}`.
const VARIANT_STYLES: Record<Variant, { container: string; text: string }> = {
  primary: { container: 'bg-brand active:bg-brand-strong', text: 'text-on-brand' },
  secondary: { container: 'bg-surface border border-line-strong active:bg-sunken', text: 'text-primary' },
  danger: { container: 'bg-danger active:opacity-90', text: 'text-white' },
  ghost: { container: 'bg-transparent active:bg-sunken', text: 'text-secondary' },
};

export function Button({ label, variant = 'primary', loading, fullWidth, icon, disabled, ...props }: ButtonProps) {
  const colors = useColors();
  const styles = VARIANT_STYLES[variant];
  const spinnerColor = variant === 'primary' ? colors.onBrand : variant === 'danger' ? '#fff' : colors.brand;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      className={`min-h-touch flex-row items-center justify-center gap-2 rounded-field px-6 ${
        fullWidth ? 'w-full' : ''
      } ${styles.container} ${disabled || loading ? 'opacity-40' : ''}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <>
          {icon}
          <Text className={`text-body font-sans-semibold ${styles.text}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
