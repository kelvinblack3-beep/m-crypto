import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

type ParallaxHeroProps = {
  /** The full-bleed hero (typically an expo-image with className="w-full h-full"). */
  hero: ReactNode;
  /** Hero height in pt (default 320). */
  heroHeight?: number;
  children: ReactNode;
};

/**
 * The scroll container for EVERY hero-led detail screen (a full-bleed photo above
 * scrolling content, transparent header + <GlassIconButton> back). Two motions,
 * both on the UI thread, both part of the default micro-set:
 *  - scrolling up: the hero recedes at HALF the content's speed (parallax);
 *  - pulling down past the top (iOS bounce): the hero STRETCHES to fill, anchored
 *    to the top, instead of revealing a blank band.
 *
 * Use INSTEAD of a plain ScrollView on these screens — a hero that scrolls 1:1
 * with the content reads flat.
 *
 *   <ParallaxHero hero={<Image source={{ uri }} className="w-full h-full" transition={imageFade} />}>
 *     {...the padded detail content...}
 *   </ParallaxHero>
 */
export function ParallaxHero({ hero, heroHeight = 320, children }: ParallaxHeroProps) {
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });

  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      {
        // Pull-down (negative y): pin to the top while scaling. Scroll-up: recede at half speed.
        translateY: interpolate(
          y.get(),
          [-heroHeight, 0, heroHeight],
          [-heroHeight / 2, 0, heroHeight * 0.5],
        ),
      },
      { scale: interpolate(y.get(), [-heroHeight, 0], [2, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
      <Animated.View style={[{ height: heroHeight, overflow: 'hidden' }, heroStyle]}>{hero}</Animated.View>
      {/* Content sits on an opaque background so the receding hero never peeks through gaps. */}
      <View className="bg-background">{children}</View>
    </Animated.ScrollView>
  );
}
