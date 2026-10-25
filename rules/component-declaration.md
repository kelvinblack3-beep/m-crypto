# Component & Function Declaration Patterns

## Impact: HIGH

Consistent patterns for declaring screen components, shared components, hooks, and utility functions.

## React Compiler

React Compiler is enabled (`experiments.reactCompiler: true` in app.json). It automatically optimizes the app at build time by handling memoization for you.

### What to do about `useMemo`, `useCallback`, and `React.memo`

**Don't add them** — the compiler handles memoization automatically. `useMemo` and `useCallback` remain an **escape hatch** for precise control (e.g. keeping an effect dependency stable).

**Existing usages** are safe to remove — the compiler optimizes equivalently with or without them.

### Reanimated shared values

Use `.set()` and `.get()` instead of direct `.value` assignment/access. Direct `.value =` is a property mutation the compiler can't optimize. `.set()` / `.get()` are method calls the compiler understands.

```ts
const scale = useSharedValue(1);

// ✅ Correct — compiler-friendly
scale.set(withTiming(0.97, timing.exit));

const style = useAnimatedStyle(() => ({
  transform: [{ scale: scale.get() }],
}));

// ❌ Wrong — breaks React Compiler
scale.value = withTiming(0.97, { duration: 160 });
```

### Scheduling JS from worklets

Use `scheduleOnRN` from `react-native-worklets` instead of `runOnJS` from `react-native-reanimated` (`runOnJS` is deprecated).

```ts
import { scheduleOnRN } from 'react-native-worklets';

withTiming(1, timing.enter, (finished) => {
  'worklet';
  if (finished) scheduleOnRN(navigate);
});
```

## Component files are UI-first

Screen and component `.tsx` files render JSX. Real logic — state coordinating features, animation setup (shared values, gesture handlers), multi-step event handlers, derived data — lives in a hook (see `rules/file-organization.md` for where the hook goes). The component receives values and handlers and wires them into JSX.

```tsx
// ✅ Correct — logic in the feature hook, JSX in the screen
export default function WorkoutsScreen() {
  const { workouts, onStartWorkout } = useWorkoutsScreen();
  return <ScrollView className="flex-1 bg-background" contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6">...</ScrollView>;
}
```

**Don't create wrapper hooks for unrelated hooks.** If a screen just calls `useFoo()` and `useBar()`, call them separately — a `useScreen()` that merely forwards both adds indirection. Only create a screen hook when there's actual screen-specific logic.

## Screen components — `function` declaration, `export default`

Route files in `src/app/` are the screens: named `function` declarations with `export default` (Expo Router requires the default export).

```tsx
// ✅ Correct — src/app/index.tsx
export default function HomeScreen() {
  return <ScrollView className="flex-1 bg-background" contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6">...</ScrollView>;
}

// ❌ Wrong — anonymous arrow default
export default () => { ... };
```

## Shared / reusable components — named function export

Shared and feature components use named `function` declarations with named export. React Compiler handles memoization — **no `memo` wrapper**.

```tsx
// ✅ Correct
type AvatarProps = {
  uri: string;
  size?: number;
};

export function Avatar({ uri, size = 40 }: AvatarProps) {
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}
```

List items follow the same rule — the compiler auto-memoizes, so no `memo` wrapper.

## Hooks — arrow `const` with explicit return type

```ts
// ✅ Correct
export const useWorkouts = (): WorkoutsState => {
  const workouts = useWorkoutsStore((s) => s.workouts);
  return { workouts };
};
```

## Utility / helper functions — arrow `const`

```ts
// ✅ Correct
export const formatDuration = (seconds: number): string => {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
```

## Summary table

| Type | Declaration | Memo | Export |
|------|------------|------|--------|
| Screen (route file in `src/app/`) | `function` declaration | No (compiler handles it) | `export default` |
| Shared / feature component | `function` declaration | No (compiler handles it) | Named export |
| List item | `function` declaration | No (compiler handles it) | Named export |
| Hook | Arrow `const` | N/A | Named export |
| Utility function | Arrow `const` | N/A | Named export |
| Callback | Arrow (inline) | No (compiler handles it) | N/A |
