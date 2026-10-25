import { PressableFeedback } from 'heroui-native';
import type { ComponentProps } from 'react';
import { Presets } from 'react-native-pulsar';

/** Fire the standard selection haptic (Pulsar). Call at the START of a HeroUI <Button>'s
 *  onPress (and any other onPress that doesn't go through <Pressable>/<ListRow>) so EVERY
 *  tap has haptic feedback. */
export function pressHaptic(): void {
  Presets.System.selection();
}

type PressableProps = ComponentProps<typeof PressableFeedback>;

/**
 * The standard pressable surface — HeroUI's PressableFeedback (built-in scale animation)
 * PLUS a selection haptic on every press. Use this for ANY tappable thing that isn't a
 * <ListRow>, a HeroUI <Button>, or the native <Segmented> — a pressable card, a custom
 * chip, an icon button. Never a bare React Native Pressable (no animation, no haptic).
 *
 * For a HeroUI <Button>, call pressHaptic() at the start of its onPress; for <ListRow> the
 * haptic is built in.
 */
export function Pressable({ onPress, ...rest }: PressableProps) {
  return (
    <PressableFeedback
      onPress={(e) => {
        pressHaptic();
        if (typeof onPress === 'function') onPress(e);
      }}
      {...rest}
    />
  );
}
