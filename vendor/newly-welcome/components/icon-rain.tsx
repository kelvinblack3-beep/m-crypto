import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { NewlyIcon } from './newly-icon';
import type { Drop } from '../particles';

type IconRainProps = {
  drops: Drop[];
  /** Called on the JS thread once a drop has left the screen so the parent can drop it. */
  onDone: (id: number) => void;
};

/** Full-screen, non-interactive layer that hosts every falling icon. */
export function IconRain({ drops, onDone }: IconRainProps) {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {drops.map((drop) => (
        <FallingIcon key={drop.id} drop={drop} width={width} height={height} onDone={onDone} />
      ))}
    </View>
  );
}

// Gravity-ish: a slow start and a long run-out, not the UI easings (those are for chrome).
const fall = Easing.bezier(0.25, 0.05, 0.55, 1);

function FallingIcon({
  drop,
  width,
  height,
  onDone,
}: {
  drop: Drop;
  width: number;
  height: number;
  onDone: (id: number) => void;
}) {
  const progress = useSharedValue(0);
  const travel = height + drop.size * 2;

  useEffect(() => {
    const finish = () => onDone(drop.id);
    progress.set(
      withTiming(1, { duration: drop.duration, easing: fall }, (finished) => {
        if (finished) scheduleOnRN(finish);
      }),
    );
  }, [drop.duration, drop.id, onDone, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    // Fade in over the first 6%, hold, fade out over the last 15%.
    const opacity = p < 0.06 ? p / 0.06 : p > 0.85 ? (1 - p) / 0.15 : 1;
    return {
      opacity,
      transform: [
        { translateY: p * travel },
        { translateX: p * drop.sway },
        { rotate: `${p * drop.spin}deg` },
      ],
    };
  });

  return (
    <Animated.View
      className="absolute"
      style={[{ left: drop.x * width - drop.size / 2, top: -drop.size * 1.5 }, style]}>
      <NewlyIcon size={drop.size} />
    </Animated.View>
  );
}
