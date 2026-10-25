import { Easing } from 'react-native-reanimated';

/**
 * The Welcome screen's internal copy of the app's easing tokens (vendored out of
 * src/lib/motion so this package never reaches back into src).
 */
export const easings = {
  /** Entering / appearing: starts fast, feels responsive. Never ease-in on an entrance. */
  enter: Easing.out(Easing.cubic),
  /** Leaving: accelerate away. */
  exit: Easing.in(Easing.cubic),
  /** Moving while on screen. */
  move: Easing.inOut(Easing.cubic),
  /** Constant motion only (progress, shimmer). */
  linear: Easing.linear,
} as const;
