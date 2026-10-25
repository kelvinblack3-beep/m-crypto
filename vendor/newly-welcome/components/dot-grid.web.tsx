import { useEffect, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { easings } from '../motion';

/**
 * Web stand-in for dot-grid.tsx: the scaffold does not load CanvasKit, so the lattice
 * is plain views here. Same look: 22px cells, faded out towards the edges, ~30% of dots
 * flash to near-black for a moment on their own 4-10s timers. A few hundred views is
 * nothing for a browser.
 */
const CELL = 22;
const DOT = 2.2;

type Dot = { key: string; x: number; y: number; base: number; duration: number; delay: number };

function edgeFade(x: number, y: number, width: number, height: number) {
  const qx = (x - width * 0.5) / (width * 0.7);
  const qy = (y - height * 0.42) / (height * 0.55);
  const d = Math.hypot(qx, qy);
  return d <= 0.3 ? 1 : d >= 1 ? 0 : 1 - (d - 0.3) / 0.7;
}

export function DotGrid() {
  const { width, height } = useWindowDimensions();

  const dots = useMemo(() => {
    const out: Dot[] = [];
    for (let y = CELL / 2; y < height; y += CELL) {
      for (let x = CELL / 2; x < width; x += CELL) {
        const fade = edgeFade(x, y, width, height);
        if (fade <= 0) continue;
        const twinkles = Math.random() < 0.3;
        out.push({
          key: `${x},${y}`,
          x,
          y,
          base: fade,
          duration: twinkles ? 4000 + Math.round(Math.random() * 6000) : 0,
          delay: Math.round(Math.random() * 10000),
        });
      }
    }
    return out;
  }, [width, height]);

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {/* Same wash + glow the native shader paints, as two gradient views. */}
      <View className="absolute inset-0 bg-linear-to-b from-accent/5 to-transparent" />
      <View
        className="absolute rounded-full bg-radial from-accent/30 to-transparent"
        style={{
          left: width * 0.5 - width * 0.62,
          top: height * 0.42 - height * 0.3,
          width: width * 1.24,
          height: height * 0.6,
        }}
      />
      {dots.map((dot) =>
        dot.duration ? (
          <TwinklingDot key={dot.key} dot={dot} />
        ) : (
          <View
            key={dot.key}
            className="absolute rounded-full bg-foreground"
            style={{ left: dot.x - DOT / 2, top: dot.y - DOT / 2, width: DOT, height: DOT, opacity: 0.12 * dot.base }}
          />
        ),
      )}
    </View>
  );
}

function TwinklingDot({ dot }: { dot: Dot }) {
  const level = useSharedValue(0);

  useEffect(() => {
    level.set(
      withDelay(
        dot.delay,
        // A short dark spike in the middle of a long quiet cycle.
        withRepeat(
          withSequence(
            withTiming(0, { duration: dot.duration * 0.38 }),
            withTiming(1, { duration: dot.duration * 0.12, easing: easings.move }),
            withTiming(0, { duration: dot.duration * 0.12, easing: easings.move }),
            withTiming(0, { duration: dot.duration * 0.38 }),
          ),
          -1,
        ),
      ),
    );
  }, [dot.delay, dot.duration, level]);

  const style = useAnimatedStyle(() => ({ opacity: (0.12 + 0.78 * level.get()) * dot.base }));

  return (
    <Animated.View
      className="absolute rounded-full bg-foreground"
      style={[{ left: dot.x - DOT / 2, top: dot.y - DOT / 2, width: DOT, height: DOT }, style]}
    />
  );
}
