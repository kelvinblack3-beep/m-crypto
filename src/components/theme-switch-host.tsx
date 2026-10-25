/**
 * Theme-switch host — the circular theme reveal, prewired. Mounted ONCE at the
 * root (_layout.tsx), so switching theme with an animation is one call:
 *
 *   const switchTheme = useThemeSwitch();
 *   switchTheme('dark', originRef.current);   // origin = the toggle's window center
 *
 * The host snapshots the WHOLE window, switches the Uniwind theme underneath the
 * frozen frame, then wipes the old frame away with a circle radiating from the
 * origin. NEVER call Uniwind.setTheme directly from a toggle — route it through
 * useThemeSwitch so the reveal plays (persisting the choice stays the caller's
 * job). Measure the toggle's center ONCE via onLayout + measureInWindow into a
 * ref and pass it synchronously on press; a per-tap measure() adds a visible hitch.
 *
 * Battle-tested pipeline — each step guards a real bug, do not "simplify":
 *  - captureScreen (react-native-view-shot) at WINDOW level, not Skia's
 *    makeImageFromView: view-tree capture misses native chrome, so the NativeTabs
 *    bar flashes the new theme before the mask finishes.
 *  - snapshot mounts above the app in a luminance Mask; wait ~100ms so it is
 *    visible BEFORE the theme cascade re-renders the tree underneath.
 *  - direction-aware: going dark a black circle grows through a white mask (the
 *    new theme unfurls from the toggle); going light a white circle shrinks to a
 *    point (the old theme collapses away). ~500ms inOut(cubic).
 *  - cleanup in the withTiming completion WITHOUT resetting the radius (React
 *    unmounts async; resetting flips the mask for one frame — old-theme flash).
 *    The radius is re-armed at the START of the next switch instead.
 *  - re-entrancy guard; no-op animation when the resolved scheme wouldn't change.
 */
import {
  Canvas,
  Circle,
  Group,
  Image,
  Mask,
  Rect,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import { createContext, use, useCallback, useRef, useState } from 'react';
import { Appearance, PixelRatio, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { captureScreen } from 'react-native-view-shot';
import { scheduleOnRN } from 'react-native-worklets';
import { Uniwind } from 'uniwind';

export type ThemeChoice = 'light' | 'dark' | 'system';

interface SwitchOrigin {
  x: number;
  y: number;
}

type ThemeSwitchFn = (next: ThemeChoice, origin?: SwitchOrigin) => void;

const ThemeSwitchContext = createContext<ThemeSwitchFn | null>(null);

/** The animated theme switch. Falls back to a plain (instant) Uniwind.setTheme
 *  when no host is mounted, so callers never need to branch. */
export const useThemeSwitch = (): ThemeSwitchFn => {
  const fn = use(ThemeSwitchContext);
  if (!fn) {
    return (next: ThemeChoice) => Uniwind.setTheme(next);
  }
  return fn;
};

const ANIMATION_DURATION = 500;
const SWITCH_DELAY = 100;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function resolveTarget(next: ThemeChoice): 'light' | 'dark' {
  if (next === 'light' || next === 'dark') return next;
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function getMaxRadius(cx: number, cy: number, w: number, h: number): number {
  const dx = Math.max(cx, w - cx);
  const dy = Math.max(cy, h - cy);
  return Math.hypot(dx, dy);
}

export function ThemeSwitchHost({ children }: { children: React.ReactNode }) {
  const pd = PixelRatio.get();
  const [overlay, setOverlay] = useState<SkImage | null>(null);
  const [animationType, setAnimationType] = useState<'circular' | 'circularInverted'>('circular');
  const animating = useRef(false);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const circleRadius = useSharedValue(0);
  const circleCenterX = useSharedValue(screenWidth / 2);
  const circleCenterY = useSharedValue(screenHeight / 2);

  const finishSwitch = useCallback(() => {
    setOverlay(null);
    animating.current = false;
    // Deliberately NOT resetting circleRadius here — see the header comment.
  }, []);

  const switchTheme = useCallback<ThemeSwitchFn>(
    async (next, origin) => {
      if (animating.current) return;

      const currentResolved = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
      const targetResolved = resolveTarget(next);
      if (currentResolved === targetResolved) {
        Uniwind.setTheme(next);
        return;
      }

      animating.current = true;
      const mode: 'circular' | 'circularInverted' =
        currentResolved === 'dark' ? 'circularInverted' : 'circular';

      const centerX = origin?.x ?? screenWidth / 2;
      const centerY = origin?.y ?? screenHeight / 2;
      circleCenterX.set(centerX);
      circleCenterY.set(centerY);

      let snapshot: SkImage | null = null;
      try {
        const base64 = await captureScreen({ format: 'png', result: 'base64' });
        const data = Skia.Data.fromBase64(base64);
        snapshot = Skia.Image.MakeImageFromEncoded(data);
      } catch {
        snapshot = null;
      }
      if (!snapshot) {
        // No frozen frame to reveal from — switch plainly rather than glitch.
        Uniwind.setTheme(next);
        animating.current = false;
        return;
      }
      setAnimationType(mode);
      setOverlay(snapshot);

      await wait(SWITCH_DELAY);

      Uniwind.setTheme(next);

      const maxRadius = getMaxRadius(centerX, centerY, screenWidth, screenHeight);
      const easing = Easing.inOut(Easing.cubic);

      const onComplete = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(finishSwitch);
      };

      if (mode === 'circular') {
        circleRadius.set(0);
        circleRadius.set(withTiming(maxRadius, { duration: ANIMATION_DURATION, easing }, onComplete));
      } else {
        circleRadius.set(maxRadius);
        circleRadius.set(withTiming(0, { duration: ANIMATION_DURATION, easing }, onComplete));
      }
    },
    [circleCenterX, circleCenterY, circleRadius, screenWidth, screenHeight, finishSwitch],
  );

  const renderMask = () => {
    if (animationType === 'circular') {
      return (
        <Group>
          <Rect height={screenHeight} width={screenWidth} color="white" />
          <Circle cx={circleCenterX} cy={circleCenterY} r={circleRadius} color="black" />
        </Group>
      );
    }
    return (
      <Group>
        <Circle cx={circleCenterX} cy={circleCenterY} r={circleRadius} color="white" />
      </Group>
    );
  };

  return (
    <ThemeSwitchContext.Provider value={switchTheme}>
      <View collapsable={false} style={styles.container}>
        {children}

        {overlay ? (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Mask mode="luminance" mask={renderMask()}>
              <Image image={overlay} x={0} y={0} width={overlay.width() / pd} height={overlay.height() / pd} />
            </Mask>
          </Canvas>
        ) : null}
      </View>
    </ThemeSwitchContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
