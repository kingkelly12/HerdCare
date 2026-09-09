import { useColorScheme } from 'react-native';

/**
 * Imperative mirror of the CSS variables in global.css.
 *
 * Most styling should go through className tokens (`bg-surface`, `text-secondary`). This exists
 * for the places that need a literal colour string — vector icons, shadows, the tab bar, the
 * native date picker — and must be kept in step with global.css.
 */
export interface AppColors {
  canvas: string;
  surface: string;
  raised: string;
  sunken: string;
  primary: string;
  secondary: string;
  tertiary: string;
  inverse: string;
  border: string;
  borderStrong: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  onBrand: string;
  earth: string;
  earthSoft: string;
  warn: string;
  warnSoft: string;
  danger: string;
  dangerSoft: string;
}

export const LIGHT_COLORS: AppColors = {
  canvas: '#F7F4EE',
  surface: '#FFFDFA',
  raised: '#FFFFFF',
  sunken: '#F0EBE2',
  primary: '#1C1A16',
  secondary: '#5C564A',
  tertiary: '#8C8476',
  inverse: '#FFFDFA',
  border: '#E2DBCF',
  borderStrong: '#CAC0B0',
  brand: '#2C7A3D',
  brandStrong: '#20602F',
  brandSoft: '#E8F2E9',
  onBrand: '#FFFFFF',
  earth: '#8C6A36',
  earthSoft: '#F5ECDD',
  warn: '#B06F08',
  warnSoft: '#FCF0DA',
  danger: '#BE282C',
  dangerSoft: '#FCE6E5',
};

export const DARK_COLORS: AppColors = {
  canvas: '#131210',
  surface: '#1E1C19',
  raised: '#282521',
  sunken: '#181614',
  primary: '#F5F1EA',
  secondary: '#B0A89C',
  tertiary: '#827A6F',
  inverse: '#181614',
  border: '#38342E',
  borderStrong: '#4E4840',
  brand: '#5CB06C',
  brandStrong: '#7AC689',
  brandSoft: '#213024',
  onBrand: '#102014',
  earth: '#C49C60',
  earthSoft: '#332A1E',
  warn: '#E8AA42',
  warnSoft: '#382B14',
  danger: '#F06A6C',
  dangerSoft: '#3C1C1D',
};

export function useColors(): AppColors {
  return useColorScheme() === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}
