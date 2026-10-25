# Animations

## Impact: HIGH

Animation is the exception, not the default. When in doubt, don't animate — a clean instant change beats a gratuitous one. These rules are enforced by the anti-slop lint and a write-time hook; violations are rejected, not just discouraged.

## Use built-in motion first

Never hand-roll a component and bolt an animation on when a component animates itself:

- Collapsible / expandable → HeroUI `Accordion` (it animates itself; a spring on a hand-rolled collapsible is a defect).
- Toggle → HeroUI `Switch`. Modal → `Dialog` / `BottomSheet`. They bring their own motion.
- Press feedback → `<Pressable>` from `@/components/pressable` / HeroUI `PressableFeedback` (built-in scale).

## Every animation uses the motion tokens

`src/lib/motion.ts` is the app's ONE animation vocabulary — like the color tokens. **Never ad-hoc duration or easing numbers in a screen.**

```tsx
import Animated, { withTiming } from 'react-native-reanimated';
import { fadeIn, fadeOut, reflow, timing, enterStaggered, imageFade } from '@/lib/motion';

// A list that reflows when items are added/removed/reordered (the core functional motion):
<Animated.View entering={fadeIn} exiting={fadeOut} layout={reflow} />

// A value that must tween (a crossfade, a progress arc):
opacity.set(withTiming(1, timing.enter));
```

| Token | Use |
|---|---|
| `timing.enter` / `timing.exit` / `timing.move` | `withTiming` configs — entrances 200ms ease-out, exits 150ms ease-in, moves 200ms in-out |
| `timing.draw` | The ONE longer motion: a one-time data draw-in (chart path, ring sweep, count-up), 500ms |
| `fadeIn` / `fadeOut` | Entering/exiting presets for content arriving/leaving the tree |
| `reflow` | `layout={reflow}` for rows that shift when a list changes |
| `enterStaggered(i)` | Staged first-reveal of a screen's primary list (reveal-once pattern — see its doc) |
| `imageFade` | `<Image transition={imageFade}>` on every remote image |
| `springs.press` / `springs.settle` | The ONLY spring configs, and only on the lively dial |

House rules the tokens encode: entrances ease OUT (never ease-in), **exits are FASTER than entrances**, nothing exceeds 300ms except a one-time data draw-in (≤ ~600ms).

## Springs are dial-gated; Bounce is banned

Read `design/dials.json` before reaching for a spring:

- Motion dial **calm / standard**: TIMING-ONLY. No `withSpring`, no `.springify()`.
- Motion dial **lively**: critically damped springs only — `withSpring(value, springs.press)` / `springs.settle` (dampingRatio 0.95–1, alive but never a visible overshoot). A bare `withSpring(x)` uses the bouncy default config and is rejected.
- `Bounce*` presets are banned on EVERY dial — a visible overshoot reads as demo motion.

## Entering vs exiting vs state change

Decision in one question: **does the component leave the React tree, or just change while mounted?**

- **Leaves the tree** (`{cond ? <X/> : null}`, item removed): `exiting={fadeOut}` on an `Animated.View`, with `layout={reflow}` on the parent's remaining rows so the gap closes smoothly.
- **Stays mounted, value changes**: tween the value with `withTiming(..., timing.move)` — don't unmount/remount to force an entering animation.
- **Mount-time entrance in a tab screen plays unseen** — NativeTabs mounts tabs eagerly off-screen. Per-visit motion (chart draw-in, count-up) is driven from `useFocusEffect` (reset the shared value, then `withTiming(1, timing.draw)` once data is ready). A list's staged entrance uses the reveal-once pattern documented on `enterStaggered`.

## Delays

- **Cascade / stagger** — sequential index-based delays across siblings (`enterStaggered(i)`) are the one sanctioned delay pattern.
- **Solo delay** — a single element with a non-zero delay is almost always a leftover workaround. Drop it.

## Designed moments

The app's signature moment, celebrations, and chart draw-ins follow the `newly:motion-design` skill and `design/DESIGN.md`'s Signature moment line — the element ITSELF animates (a stroke draws, a ring sweeps, a number counts up), never a crossfade between two static icons. At most one designed moment per screen beyond the functional floor.
