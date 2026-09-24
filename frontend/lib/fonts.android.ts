/**
 * Android: the fonts are already inside the app, so there is nothing to wait for.
 *
 * Loading them from JavaScript at launch used to hold the splash screen for a second or more on a
 * cheap phone, reading four font files one after another after the database had opened. The
 * `expo-font` plugin in app.json now copies them into the build instead, and Android resolves
 * `fontFamily: 'Inter_600SemiBold'` straight from the file name.
 */
export function useAppFonts(): [boolean, Error | null] {
  return [true, null];
}
