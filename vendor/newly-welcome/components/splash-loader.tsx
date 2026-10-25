import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { easings } from '../motion';

const TRACK_WIDTH = 120;
const THUMB_RATIO = 0.38;
// One sweep of the thumb across the track. Longer than UI motion on purpose: it loops.
const SWEEP_MS = 1100;

/**
 * The splash's loading indicator: a slim accent thumb sweeping an accent-tinted track,
 * with a one-line label. Indeterminate, because the splash is a fixed brand beat, not
 * a real progress measurement.
 */
export function SplashLoader() {
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: easings.move }), -1));
  }, [sweep]);

  const thumbStyle = useAnimatedStyle(() => ({
    // From fully off the left edge to fully off the right edge.
    transform: [{ translateX: -TRACK_WIDTH * THUMB_RATIO + sweep.get() * TRACK_WIDTH * (1 + THUMB_RATIO) }],
  }));

  return (
    <View className="items-center gap-3">
      <View className="h-1 overflow-hidden rounded-full bg-accent/15" style={{ width: TRACK_WIDTH }}>
        <Animated.View
          className="h-full rounded-full bg-accent"
          style={[{ width: TRACK_WIDTH * THUMB_RATIO }, thumbStyle]}
        />
      </View>
      <Text className="text-sm font-medium text-muted">Getting things ready</Text>
    </View>
  );
}
