import { View } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import type { Species } from '@/db/schema';
import { useColors } from '@/theme/colors';

/**
 * Species iconography.
 *
 * These replaced emoji, which rendered differently on every OS version — and worse, the donkey
 * (U+1FACF, Emoji 15.0) showed as an empty box on the Android 12/13 handsets common in the field.
 * Six species come from MaterialCommunityIcons; goat only exists in MaterialIcons, so the family
 * is hidden behind this component and a bespoke icon set can replace it in one file.
 */
type IconSpec =
  | { family: 'mci'; name: keyof typeof MaterialCommunityIcons.glyphMap }
  | { family: 'mi'; name: keyof typeof MaterialIcons.glyphMap };

const SPECIES_ICON: Record<Species, IconSpec> = {
  cow: { family: 'mci', name: 'cow' },
  goat: { family: 'mi', name: 'goat' },
  sheep: { family: 'mci', name: 'sheep' },
  pig: { family: 'mci', name: 'pig-variant' },
  horse: { family: 'mci', name: 'horse-variant' },
  donkey: { family: 'mci', name: 'donkey' },
  dog: { family: 'mci', name: 'dog-side' },
};

interface SpeciesIconProps {
  species: Species;
  size?: number;
  color?: string;
}

export function SpeciesIcon({ species, size = 24, color }: SpeciesIconProps) {
  const colors = useColors();
  const tint = color ?? colors.brand;
  const spec = SPECIES_ICON[species];
  if (spec.family === 'mi') {
    return <MaterialIcons name={spec.name} size={size} color={tint} />;
  }
  return <MaterialCommunityIcons name={spec.name} size={size} color={tint} />;
}

interface SpeciesAvatarProps extends SpeciesIconProps {
  /** Tints the disc to mark an animal that needs attention. */
  tone?: 'default' | 'warn' | 'danger';
}

const TONE_CLASS = {
  default: 'bg-brand-soft',
  warn: 'bg-warn-soft',
  danger: 'bg-danger-soft',
} as const;

/** The species mark on a tinted disc — the recurring identity element for an animal. */
export function SpeciesAvatar({ species, size = 24, color, tone = 'default' }: SpeciesAvatarProps) {
  const diameter = size + 20;
  return (
    <View className={`items-center justify-center rounded-pill ${TONE_CLASS[tone]}`} style={{ width: diameter, height: diameter }}>
      <SpeciesIcon species={species} size={size} color={color} />
    </View>
  );
}
