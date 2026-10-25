import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  DotGrid,
  IconRain,
  type Drop,
  type Pound,
  type Spark,
  SplashLoader,
  WelcomeIcon,
  makeBurst,
  makeDrop,
} from '@newly/welcome';
import { timing } from '@/lib/motion';

/** Every Nth tap is the big one: a harder pound and a ring of icons out of the centre. */
const BURST_EVERY = 10;
/** How long the splash holds before the game reveals. A brand beat, not a real load. */
const SPLASH_MS = 2600;
/** How far the title and footer rise from as they reveal. */
const REVEAL_RISE = 10;

/**
 * The screen every new Newly project boots into, and the one the agent replaces first.
 * It is a brand moment, not a pattern to copy: a real app's home screen is a scroll
 * container of <Section>s and <Card>s (see rules/ and the component docs), not a toy.
 *
 * Boot: the icon lands over the dot grid with a loader under it (the splash). After
 * SPLASH_MS the loader fades, the icon stays exactly where it is, and the title and
 * footer rise in. From then on: tap the icon, it pounds and one Newly icon falls from
 * the top; every tenth tap bursts a ring of them out of the centre.
 */
export default function WelcomeScreen() {
  const [phase, setPhase] = useState<'splash' | 'game'>('splash');
  // Outlives the splash by one reveal so the loader can fade out instead of vanishing.
  const [loaderMounted, setLoaderMounted] = useState(true);
  const [taps, setTaps] = useState(0);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const nextId = useRef(1);
  const reveal = useSharedValue(0);

  useEffect(() => {
    const handOff = setTimeout(() => {
      setPhase('game');
      reveal.set(withTiming(1, timing.draw));
    }, SPLASH_MS);
    const unmountLoader = setTimeout(() => setLoaderMounted(false), SPLASH_MS + timing.draw.duration);
    return () => {
      clearTimeout(handOff);
      clearTimeout(unmountLoader);
    };
  }, [reveal]);

  const handleTap = (): Pound => {
    const count = taps + 1;
    const isBurst = count % BURST_EVERY === 0;
    setTaps(count);
    setDrops((current) => [...current, makeDrop(nextId.current++)]);
    if (isBurst) {
      const burst = makeBurst(nextId.current);
      nextId.current += burst.length;
      setSparks((current) => [...current, ...burst]);
    }
    return isBurst ? 'big' : 'small';
  };

  // Particles announce when their flight ends; dropping them keeps the layers tiny.
  const settleDrop = useCallback((id: number) => {
    setDrops((current) => current.filter((drop) => drop.id !== id));
  }, []);
  const settleSpark = useCallback((id: number) => {
    setSparks((current) => current.filter((spark) => spark.id !== id));
  }, []);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.get(),
    transform: [{ translateY: (1 - reveal.get()) * REVEAL_RISE }],
  }));
  const loaderStyle = useAnimatedStyle(() => ({ opacity: 1 - reveal.get() }));

  const footer =
    taps === 0 ? 'Made with Newly' : taps < BURST_EVERY ? `${taps} of ${BURST_EVERY}` : `${taps} taps`;

  return (
    <View className="flex-1 bg-background">
      <DotGrid />
      <IconRain drops={drops} onDone={settleDrop} />
      <View className="flex-1 items-center justify-center gap-9 px-8 pb-safe-offset-12">
        <WelcomeIcon
          onTap={handleTap}
          disabled={phase === 'splash'}
          sparks={sparks}
          onSparkDone={settleSpark}
        />
        {/* The loader sits over the copy's slot, so the hand-off swaps them in place and
            the icon above never moves. */}
        <View className="items-center justify-center">
          <Animated.View className="items-center gap-2" style={revealStyle}>
            <Text className="text-4xl font-bold tracking-tight text-foreground">Welcome to Newly</Text>
            <Text className="text-center text-lg text-muted">Where ideas become real apps.</Text>
          </Animated.View>
          {loaderMounted ? (
            <Animated.View
              pointerEvents="none"
              className="absolute inset-0 items-center justify-center"
              style={loaderStyle}>
              <SplashLoader />
            </Animated.View>
          ) : null}
        </View>
      </View>
      <Animated.View className="absolute inset-x-0 bottom-0 items-center pb-safe-offset-6" style={revealStyle}>
        <Text className="text-sm font-medium text-muted">{footer}</Text>
      </Animated.View>
    </View>
  );
}
