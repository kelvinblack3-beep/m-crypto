/**
 * Web stand-in for react-native-pulsar (haptics).
 *
 * The real module runs `TurboModuleRegistry.getEnforcing('RNPulsar')` at the top
 * level of NativeRNPulsar.js, and react-native-web does not export
 * TurboModuleRegistry at all — so on web the import itself threw
 * "Cannot read properties of undefined (reading 'getEnforcing')" before React
 * rendered a single element, and the whole app was a redbox. `Presets` is
 * reached from the first screen (pressable, list-row, confirm), so there was no
 * path through the app that avoided it.
 *
 * Swapped in by metro.config.js for `platform === 'web'` ONLY, so native builds
 * keep the real haptics. Doing it at the resolver rather than at the import
 * sites is deliberate: new screens import 'react-native-pulsar' directly, the
 * way rules/ tells them to, and each one would otherwise reintroduce the crash.
 *
 * Everything here is inert. A browser has no haptics — navigator.vibrate is a
 * vibration motor, Android Chrome only, and is not what these presets mean.
 */
const noop = (): void => undefined;

/**
 * Presets is a flat namespace of hundreds of named effects (plus System and
 * System.Android), and it grows with the library. Proxying it keeps every name
 * — present and future — a no-op, instead of a transcribed list that goes stale
 * and reintroduces the crash the first time a screen reaches for a new one.
 */
const inertPresets: any = new Proxy(function () {} as unknown as object, {
  // `then` must stay undefined: a thenable would make `await` on any of this
  // recurse forever. Symbols (Symbol.toPrimitive, inspection) fall through too.
  get: (_target, key) => (key === "then" || typeof key === "symbol" ? undefined : inertPresets),
  apply: () => undefined,
});

export const Presets = inertPresets;

export enum HapticSupport {
  NO_SUPPORT = 0,
  LIMITED_SUPPORT = 1,
  STANDARD_SUPPORT = 2,
  ADVANCED_SUPPORT = 3,
}

export enum RealtimeComposerStrategy {
  ENVELOPE = 0,
  PRIMITIVE_TICK = 1,
  PRIMITIVE_COMPLEX = 2,
  ENVELOPE_WITH_DISCRETE_PRIMITIVES = 3,
}

export const Settings = {
  enableHaptics: noop,
  enableSound: noop,
  enableCache: noop,
  clearCache: noop,
  preloadPresets: noop,
  stopHaptics: noop,
  shutDownEngine: noop,
  // Honest answer for a browser, and the value callers branch on.
  getHapticsSupportLevel: () => HapticSupport.NO_SUPPORT,
  forceHapticsSupportLevel: noop,
  enableImpulseCompositionMode: noop,
  setRealtimeComposerStrategy: noop,
} as const;

// The hooks return real object shapes rather than the proxy: callers destructure
// them and check `isActive()` / `isParsed()`, and a truthy proxy would answer
// "yes, playing" on a device that cannot play anything.
export const useRealtimeComposer = () => ({
  start: noop,
  set: noop,
  playDiscrete: noop,
  stop: noop,
  isActive: () => false,
});

export const usePatternComposer = () => ({
  play: noop,
  stop: noop,
  parse: noop,
  isParsed: () => false,
});

export const useAdaptiveHaptics = () => ({ play: noop });
