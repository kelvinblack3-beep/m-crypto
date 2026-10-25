import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { pressHaptic } from '../haptics';
import { IconBurst } from './icon-burst';
import { NewlyIcon } from './newly-icon';
import type { Spark } from '../particles';
import { easings } from '../motion';

export const HERO_SIZE = 168;

export type Pound = 'small' | 'big';

type WelcomeIconProps = {
  /** Runs on every tap; returns which pound to play. */
  onTap: () => Pound;
  /** Ignore taps (the splash is still up). */
  disabled?: boolean;
  sparks: Spark[];
  onSparkDone: (id: number) => void;
};

// Idle: a slow rise and fall so the screen never looks frozen while the agent works.
const FLOAT_MS = 1800;
const FLOAT_PT = 8;

/**
 * The hero: the Newly icon, floating, that pounds when tapped. It lands on mount
 * (scales in from 0.6 with a small overshoot) and stays put across the splash-to-game
 * hand-off, so the boot never shows the icon jumping. Each tap re-assigns the whole
 * pound sequence, which cancels any pound still in flight, so hammering it never stalls
 * or drifts. The burst layer is anchored inside this box so sparks leave from the
 * icon's centre.
 */
export function WelcomeIcon({ onTap, disabled = false, sparks, onSparkDone }: WelcomeIconProps) {
  const float = useSharedValue(0);
  const scale = useSharedValue(1);
  const arrive = useSharedValue(0.6);

  useEffect(() => {
    // Land: 0.6 -> 1.06 -> 1 with the opacity riding the first leg. Longer than UI
    // chrome motion on purpose: this is the app's one entrance.
    arrive.set(
      withSequence(
        withTiming(1.06, { duration: 420, easing: easings.enter }),
        withTiming(1, { duration: 280, easing: easings.move }),
      ),
    );
    float.set(
      withRepeat(
        withSequence(
          withTiming(-FLOAT_PT, { duration: FLOAT_MS, easing: easings.move }),
          withTiming(0, { duration: FLOAT_MS, easing: easings.move }),
        ),
        -1,
      ),
    );
  }, [arrive, float]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.get() }] }));
  const poundStyle = useAnimatedStyle(() => ({
    // Fades in over the landing's first leg (0.6 -> 1), then stays opaque.
    opacity: Math.min(1, Math.max(0, (arrive.get() - 0.6) / 0.4)),
    transform: [{ scale: arrive.get() * scale.get() }],
  }));

  const handlePress = () => {
    pressHaptic();
    const pound = onTap();
    scale.set(
      pound === 'big'
        ? withSequence(
            withTiming(0.78, { duration: 170, easing: easings.exit }),
            withTiming(1.32, { duration: 210, easing: easings.enter }),
            withTiming(0.96, { duration: 150, easing: easings.move }),
            withTiming(1, { duration: 170, easing: easings.move }),
          )
        : withSequence(
            withTiming(0.84, { duration: 130, easing: easings.exit }),
            withTiming(1.08, { duration: 130, easing: easings.enter }),
            withTiming(1, { duration: 120, easing: easings.move }),
          ),
    );
  };

  return (
    // A bare Pressable on purpose: PressableFeedback's own scale would fight the pound.
    // The haptic is fired by hand above, so the tap still has both feedback channels.
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Newly icon"
      accessibilityHint="Tap to drop an icon"
      hitSlop={12}>
      <Animated.View style={[{ width: HERO_SIZE, height: HERO_SIZE }, floatStyle]}>
        <Animated.View style={poundStyle}>
          <NewlyIcon size={HERO_SIZE} glow />
        </Animated.View>
        <IconBurst sparks={sparks} onDone={onSparkDone} />
      </Animated.View>
    </Pressable>
  );
}
