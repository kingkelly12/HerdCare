import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

/**
 * Three elevation levels, used consistently:
 *
 * - `flat`     content that sits directly on the canvas with no container of its own. The default
 *              for lists and sections — most things should NOT be a card.
 * - `raised`   a resting panel, separated by a hairline rather than a shadow.
 * - `floating` genuinely lifted: sheets, the FAB, the row being acted on.
 */
export type Elevation = 'flat' | 'raised' | 'floating';

const ELEVATION_CLASS: Record<Elevation, string> = {
  flat: 'bg-transparent',
  raised: 'bg-surface border border-line',
  floating: 'bg-raised border border-line',
};

// Shadows have to be real style props; NativeWind's shadow utilities do not reach Android elevation.
const FLOATING_SHADOW = {
  elevation: 6,
  shadowColor: '#000',
  shadowOpacity: 0.16,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
} as const;

interface SurfaceProps extends ViewProps {
  level?: Elevation;
}

export function Surface({ level = 'raised', className, style, ...props }: SurfaceProps) {
  return (
    <View
      className={`rounded-card ${ELEVATION_CLASS[level]} ${className ?? ''}`}
      style={[level === 'floating' ? FLOATING_SHADOW : undefined, style]}
      {...props}
    />
  );
}

interface PressableSurfaceProps extends PressableProps {
  level?: Elevation;
}

export function PressableSurface({ level = 'raised', className, style, ...props }: PressableSurfaceProps) {
  return (
    <Pressable
      className={`rounded-card active:bg-sunken ${ELEVATION_CLASS[level]} ${className ?? ''}`}
      style={[level === 'floating' ? FLOATING_SHADOW : undefined, style as never]}
      {...props}
    />
  );
}
