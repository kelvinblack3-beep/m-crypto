import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/** iOS clips app icons to a superellipse whose corner radius is ~22.4% of the side. */
const CORNER_RATIO = 0.224;

// A JS-only asset (not app.json's `icon`), so it never touches the native fingerprint.
const source = require('../assets/newly-icon.png');

/**
 * The Newly app icon as an image, squircle-clipped the way the home screen shows it.
 * `size` is the side in pt; the same component draws the 168pt hero and every 20-50pt
 * rain / burst particle, so they all read as the same object.
 */
export function NewlyIcon({ size, glow = false }: { size: number; glow?: boolean }) {
  return (
    // The glow lives on the rounded clip itself so the shadow follows the squircle, not
    // a square box around it.
    <View
      className={glow ? 'shadow-2xl shadow-accent/40' : undefined}
      style={[styles.clip, { width: size, height: size, borderRadius: size * CORNER_RATIO }]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  // borderCurve has no Tailwind utility; StyleSheet is the sanctioned place for it.
  clip: { overflow: 'hidden', borderCurve: 'continuous' },
});
