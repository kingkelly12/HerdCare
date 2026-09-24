import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

/**
 * Whether the app's fonts are ready to draw with, as `[loaded, error]`.
 *
 * iOS and web load Inter from the JavaScript bundle at launch. Android does not need to: the four
 * weights are built into the app by the `expo-font` plugin in app.json, so they are there before
 * any JavaScript runs. See fonts.android.ts.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
}
