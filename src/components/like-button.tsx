import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from 'heroui-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Pressable } from '@/components/pressable';
import { durations, easings, timing } from '@/lib/motion';

type LikeButtonProps = {
  liked: boolean;
  /** Called with the NEW liked state — persist it in the store here. */
  onLiked: (next: boolean) => void;
  /** Icon size; the touch target stays 44pt regardless. */
  size?: number;
};

// Each burst rolls fresh random specs (angle / distance / size / spin / delay) so no
// two likes look alike — never a fixed, evenly-spaced ring of particles, and the
// spread stays CONTAINED (~28-32pt of travel max; a burst that sprawls reads messy).
type ParticleSpec = {
  kind: 'heart' | 'sparkle';
  angle: number;
  dist: number;
  rot: string;
  size: number;
  delay: number;
};

function makeBurst(): ParticleSpec[] {
  const specs: ParticleSpec[] = [];
  for (let i = 0; i < 4; i++) {
    specs.push({
      kind: 'heart',
      angle: Math.random() * 2 * Math.PI,
      dist: 18 + Math.random() * 10,
      rot: `${Math.round((Math.random() - 0.5) * 50)}deg`,
      size: 7 + Math.round(Math.random() * 3),
      delay: Math.random() * 90,
    });
  }
  for (let i = 0; i < 3; i++) {
    specs.push({
      kind: 'sparkle',
      // Sparkles fan mostly upward; the mini hearts go anywhere.
      angle: -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2,
      dist: 22 + Math.random() * 10,
      rot: `${Math.round((Math.random() - 0.5) * 40)}deg`,
      size: 8 + Math.round(Math.random() * 3),
      delay: 40 + Math.random() * 100,
    });
  }
  return specs;
}

/** One burst particle — a tiny accent heart or a ✨ sparkle (transient celebration
 *  particles are the ONE sanctioned emoji use; never UI icons). One-shot on mount —
 *  the burst re-keys to replay, so a parent re-render never restarts it mid-flight. */
function BurstParticle({ spec, color }: { spec: ParticleSpec; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withDelay(spec.delay, withTiming(1, { duration: 500, easing: easings.enter })));
  }, [progress, spec.delay]);

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    const fade = p < 0.2 ? p / 0.2 : Math.max(0, 1 - (p - 0.2) / 0.8);
    return {
      opacity: fade,
      transform: [
        { translateX: Math.cos(spec.angle) * spec.dist * p },
        { translateY: Math.sin(spec.angle) * spec.dist * p },
        { scale: 0.5 + 0.5 * Math.min(1, p * 1.6) },
        { rotate: spec.rot },
      ],
    };
  });

  if (spec.kind === 'heart') {
    return (
      <Animated.View pointerEvents="none" className="absolute" style={style}>
        <Ionicons name="heart" size={spec.size} color={color} />
      </Animated.View>
    );
  }
  return (
    <Animated.Text pointerEvents="none" style={[{ position: 'absolute', fontSize: spec.size }, style]}>
      ✨
    </Animated.Text>
  );
}

/** The quick ring pulse under the particles — thin, sweeping to ~38pt, gone in 450ms. */
function BurstRing({ color }: { color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withTiming(1, { duration: 450, easing: easings.enter }));
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - progress.get()),
    transform: [{ scale: 0.5 + progress.get() * 1.1 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      className="absolute size-6 rounded-full border"
      style={[style, { borderColor: color, borderWidth: 1.5 }]}
    />
  );
}

/**
 * THE like/favorite control — the X-style like, tight and randomized: on like the
 * heart VANISHES and pops back in with a slight overshoot while a small ring
 * pulses and a handful of tiny hearts + ✨ sparkles scatter at RANDOM angles
 * (fresh randomness every burst, contained spread, all settled ~600ms) + haptic.
 * Un-like is just a quick shrink — removing is not a moment.
 *
 * Use this for EVERY like/favorite/heart/save-to-collection toggle — never a bare
 * icon with an onPress (a static heart that just swaps color reads dead).
 *
 *   <LikeButton liked={isSaved} onLiked={(next) => toggleSaved(recipe.id, next)} />
 */
export function LikeButton({ liked, onLiked, size = 22 }: LikeButtonProps) {
  const accent = useThemeColor('accent');
  const muted = useThemeColor('muted');
  const scale = useSharedValue(1);
  // Re-keying the burst remounts the ring + particles, replaying their one-shot flights.
  const [burstKey, setBurstKey] = useState(0);
  const [particles, setParticles] = useState<ParticleSpec[]>([]);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const onPress = () => {
    const next = !liked;
    if (next) {
      // The X recipe: vanish, then pop in with overshoot while the burst plays.
      scale.set(0);
      scale.set(
        withDelay(
          50,
          withSequence(
            withTiming(1.25, { duration: 250, easing: easings.enter }),
            withTiming(1, timing.enter),
          ),
        ),
      );
      setParticles(makeBurst());
      setBurstKey((k) => k + 1);
    } else {
      scale.set(
        withSequence(
          withTiming(0.85, { duration: durations.fast / 2, easing: easings.exit }),
          withTiming(1, { duration: durations.fast, easing: easings.enter }),
        ),
      );
    }
    onLiked(next);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Remove from favorites' : 'Add to favorites'}
      onPress={onPress}
    >
      <View className="size-11 items-center justify-center">
        {liked && burstKey > 0 ? (
          <View key={burstKey} className="absolute items-center justify-center" pointerEvents="none">
            <BurstRing color={accent} />
            {particles.map((spec, i) => (
              <BurstParticle key={i} spec={spec} color={accent} />
            ))}
          </View>
        ) : null}
        <Animated.View style={heartStyle}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? accent : muted} />
        </Animated.View>
      </View>
    </Pressable>
  );
}
