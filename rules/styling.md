# Styling Patterns

## Impact: HIGH

Consistent styling with Uniwind (Tailwind CSS v4 for React Native) + the locked design tokens.

## Priority order — pick the first that works

1. **Tailwind / Uniwind `className`** with **token utilities** (`bg-background`, `text-foreground`, `bg-surface`, `text-muted`, `bg-accent`, `border-border`, `rounded-2xl`, …). If the value is static, the answer is almost always a className — gradients, shadows, transforms, and blur all have Tailwind equivalents.
2. **`StyleSheet.create` at module scope** — only when the property has *no* Tailwind/Uniwind equivalent (e.g. `borderCurve: 'continuous'`) AND the value is static, or for native-prop surfaces Uniwind can't style (NativeTabs, `@expo/ui`, glass).
3. **Inline `style={…}`** — last resort. Only for genuinely runtime-computed values (props/state arithmetic, `useWindowDimensions`, `onLayout` sizes) and `useAnimatedStyle` / `useAnimatedProps` return values (the API requires it).

```tsx
// ✅ Animated styles are inline by design
const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
<Animated.View className="h-24 w-full rounded-2xl bg-accent" style={animatedStyle} />

// ✅ Truly dynamic runtime value
<View style={{ width: width * 0.8 }}>

// ❌ Static values in inline style
<View style={{ backgroundColor: '#f7f5ee' }}>   // use a token utility
<View style={{ height: '62%', borderRadius: 24 }}>  // use h-[62%] rounded-3xl
```

## Colors come from tokens — never raw hex

Semantic color tokens live in `src/global.css` (plus HeroUI's base tokens). Components consume them through utilities. **Raw hex / rgb / hsl in component code fails the anti-slop lint.** The one exception file is `src/constants/theme.ts` — the sanctioned native-fallback palette for components that need real color values.

```tsx
// ✅ Correct — semantic tokens
<View className="bg-background">
<Text className="text-foreground">
<View className="border border-border bg-surface">
<Text className="text-muted">

// ❌ Wrong — hardcoded colors, manual dark variants
<View className="bg-white dark:bg-slate-900">
<Text className="text-[#404040]">
```

To change the app's look, edit the tokens in `src/global.css` (between the `@newly:tokens` markers) — never hand-patch individual screens.

### Runtime color values — read the token, don't paste hex

When a color must be a **JS value** (icon `color` props, SVG `fill`/`stroke`, tint colors, animated color outputs), read it from the theme instead of hardcoding:

```tsx
import { useThemeColor } from 'heroui-native';   // HeroUI tokens: 'accent', 'muted', 'foreground', …
const accent = useThemeColor('accent');
<Ionicons name="checkmark-circle" size={22} color={accent} />

import { useCSSVariable } from 'uniwind';        // any CSS variable from global.css
const heroStart = useCSSVariable('--hero-start') as string;
```

If the token you want doesn't exist yet, add it to `global.css` first — don't paste the same hex across components.

## Spacing — always from the scale, gap over margins

- Spacing values come from the Tailwind scale (`gap-2/3/4/6`, `p-4`, `px-5`). **Arbitrary bracket spacing (`p-[17px]`, `gap-[13px]`) fails the lint** — snap to the nearest scale step instead.
- **Never margins for spacing between siblings** (`mt-/mb-/mx-/m-*` drift screen to screen — the lint rejects them in screen code). Put the space **between** children with `gap-*` on the parent; inner padding with `p-*`.
- The only allowed margins: negative margins for a full-bleed element, and `mx-auto` for centering.

```tsx
// ✅ Correct — gap on parent
<View className="flex-1 items-center gap-3 px-6">
  <Text>Title</Text>
  <Button>Action</Button>
</View>

// ❌ Wrong — margin on each child
<Button className="mt-3">Action</Button>
```

## Components own internal spacing only

Reusable components must be layout-agnostic: no outer `margin` or screen-level padding on the outermost container. The parent controls spacing between components via `gap`/`padding`. (`<Screen>` provides section rhythm; `<Card>` provides card padding.)

## Safe areas — utility classes are the ONE inset mechanism

- Every screen root carries the safe-area padding as classes:
  `contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6"` (on the
  screen's ScrollView / FlatList, or as plain classes on a fixed `View` root).
  `pt-safe-offset-2` = status bar + 8px; `pb-safe-offset-22` = home indicator + 88px,
  which clears the floating tab bar. On a pushed/modal screen outside the tab bar, use
  `pb-safe-offset-4` instead.
- **Never** `SafeAreaView`, `useSafeAreaInsets` arithmetic, or
  `contentInsetAdjustmentBehavior` in a screen (lint fails it) — mixing mechanisms
  double-counts the inset: the giant-top-gap / cut-off-header bug.
- The tab bar is the other half of that same invariant: every `NativeTabs.Trigger` in
  `src/components/app-tabs.tsx` carries `disableAutomaticContentInsets` (the lint fails a
  Trigger without it). expo-router defaults that flag ON, and it applies a *native* inset
  the classes know nothing about: on iOS react-native-screens flips the screen's first
  descendant ScrollView to `contentInsetAdjustmentBehavior = Automatic` (top AND bottom),
  and on Android the screen is wrapped in `<SafeAreaView edges={{ bottom: true }}>`. Left
  on, every screen root is padded twice: the status bar counted twice on iOS, which is the
  tall empty band above the large title, and the home indicator twice on both platforms.
- Other anchored elements use the same utilities (`top-safe-offset-2`, `pb-safe`) — not
  `insets.*` math.
- **Inside sheets** (HeroUI `BottomSheet`, `formSheet` routes): the sheet already insets the home indicator — use plain `pb-4`, never `pb-safe*` (double padding).

## Font size, radius, sizing — scale first

Use the scale class when the value matches; arbitrary `[N]` only when nothing matches.

- Text: `text-xs`(12) `text-sm`(14) `text-base`(16) `text-lg`(18) `text-xl`(20) `text-2xl`(24) `text-3xl`(30). `text-[17px]` only when no step fits.
- Radius: `rounded-lg`(8) `rounded-xl`(12) `rounded-2xl`(16) `rounded-3xl`(24) `rounded-full`. These derive from the `--radius` token — prefer them so the density dial keeps working.
- Sizing: keyword (`h-full`, `w-screen`) → fraction (`w-1/2`) → scale (`size-8`, `h-10`) → arbitrary (`h-[62%]`). Use `size-*` when width = height.

```tsx
// ❌ Wrong — arbitrary when a class exists
<View className="w-[24px] h-[24px] rounded-[16px]">
// ✅ Correct
<View className="size-6 rounded-2xl">
```

## Gradients have a className

```tsx
// ✅ Tailwind v4 gradient with tokens
<View className="bg-linear-to-b from-accent to-transparent">

// ✅ Arbitrary angle / stops
<View className="bg-[linear-gradient(351deg,var(--accent)_0%,transparent_100%)]">

// ❌ experimental_backgroundImage inline style — only if the className genuinely doesn't render
```

## Avoid imperceptible classes

Don't add classes with no visible effect (`tracking-[-0.14px]`, `opacity-[0.99]`). Don't translate Figma letter-spacing exports into `tracking-[Npx]` — drop them. Only add `tracking-*` when explicitly asked, and use scale values (`tracking-tight`).

## Class merging with `cn()`

Use `cn()` from `@/lib/cn` when merging classNames that may conflict:

```tsx
import { cn } from '@/lib/cn';

<View className={cn('p-4 bg-surface', props.className)} />

// ❌ Wrong — conflicting classes without dedup
<View className={`p-4 bg-surface ${props.className}`} />
```

## Third-party components

Use `withUniwind` for third-party components that don't support `className`. Never wrap `react-native` or `react-native-reanimated` components — they already support it.
