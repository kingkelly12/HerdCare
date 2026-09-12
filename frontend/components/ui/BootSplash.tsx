import { Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

/**
 * The full-bleed brand splash, shown while fonts load and the database migrates.
 *
 * This exists because the *system* splash cannot show this artwork. From Android 12 the launch
 * screen is a platform-drawn centred icon on a flat colour, and expo-splash-screen composites
 * whatever image it is given into a square icon slot. A 9:16 design like assets/splash.png would
 * be squeezed into a narrow vertical strip. So the system splash stays a logo on green, and the
 * artwork gets shown here instead, at full size, for the part of the launch we actually control.
 *
 * Deliberately styled with StyleSheet rather than NativeWind classes: this is the first thing
 * painted on a cold start, and it should not depend on any styling runtime having warmed up.
 */

/**
 * The artwork's own top edge, and the same value as `backgroundColor` in the expo-splash-screen
 * config in app.json.
 *
 * Those two matching is what makes the handover invisible. Android draws a flat screen of that
 * colour before any JavaScript runs, then this image replaces it; identical colour at the top of
 * the screen means there is nothing to see at the moment of the swap.
 */
const SPLASH_TOP = '#2B7440';

export function BootSplash({ onLayout }: { onLayout?: () => void }) {
  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* The artwork is dark green, so the clock and battery icons need to be light. */}
      <StatusBar style="light" />
      <Image
        /*
         * The JPEG, not the PNG master beside it. The artwork is a photographic gradient with no
         * transparency, which PNG stores badly: quality-92 JPEG is 330KB against 2.3MB for the
         * same pixels, with a worst-case deviation of 12/255 at the sharpest logo edges and none
         * of the banding a gradient usually risks. assets/splash.png stays in the repo as the
         * editable original; only this file is bundled.
         *
         * Relative rather than aliased: this has to resolve at boot with no room for surprises.
         */
        source={require('../../assets/splash.jpg')}
        style={styles.image}
        // `cover` rather than `contain`, because phones are taller than the artwork's 9:16. Cover
        // trims a little from the sides and keeps the logo, wordmark and tagline all centred;
        // contain would letterbox the design between two bars.
        resizeMode="cover"
        // Decoding is what we are waiting on before hiding the system splash, so no fade.
        fadeDuration={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_TOP,
  },
  // The container is flex:1, so filling it edge to edge is all that is needed.
  image: {
    width: '100%',
    height: '100%',
  },
});
