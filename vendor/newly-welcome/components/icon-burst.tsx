import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { NewlyIcon } from './newly-icon';
import type { Spark } from '../particles';

type IconBurstProps = {
  sparks: Spark[];
  onDone: (id: number) => void;
};

/**
 * Sparks flying out of a point. Render it INSIDE the hero's box: it is a zero-size
 * anchor at the box's centre, so every spark starts exactly where the icon is.
 */
export function IconBurst({ sparks, onDone }: IconBurstProps) {
  return (
    <View pointerEvents="none" className="absolute left-1/2 top-1/2 size-0">
      {sparks.map((spark) => (
        <FlyingIcon key={spark.id} spark={spark} onDone={onDone} />
      ))}
    </View>
  );
}

// Explosive: nearly all the distance in the first half, then a drift to a stop.
const fling = Easing.bezier(0.15, 0.7, 0.3, 1);

function FlyingIcon({ spark, onDone }: { spark: Spark; onDone: (id: number) => void }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const finish = () => onDone(spark.id);
    progress.set(
      withTiming(1, { duration: spark.duration, easing: fling }, (finished) => {
        if (finished) scheduleOnRN(finish);
      }),
    );
  }, [onDone, progress, spark.duration, spark.id]);

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    const opacity = p < 0.08 ? p / 0.08 : p > 0.7 ? (1 - p) / 0.3 : 1;
    return {
      opacity,
      transform: [
        { translateX: p * spark.dx },
        { translateY: p * spark.dy },
        { scale: 0.2 + 0.8 * Math.min(1, p * 2) },
        { rotate: `${p * spark.spin}deg` },
      ],
    };
  });

  return (
    <Animated.View
      className="absolute"
      style={[{ left: -spark.size / 2, top: -spark.size / 2 }, style]}>
      <NewlyIcon size={spark.size} />
    </Animated.View>
  );
}
