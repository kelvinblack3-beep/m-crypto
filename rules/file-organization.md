# File Organization

## Impact: HIGH

Consistent rules for where files live, how components split, and where hooks go.

## The layout

```
src/
├── app/                     ← Expo Router routes. EVERY .tsx here is a screen (or _layout).
│                              Screen UI lives here; screen LOGIC goes in a feature hook.
├── components/              ← App-wide primitives (Section, Card, ListRow, Segmented,
│                              Pressable, …). Shared, reusable, feature-agnostic.
├── features/<feature>/      ← Domain modules. Everything a feature owns beyond its screen file:
│   ├── components/          ←   feature-scoped UI components (may hold colocated hooks)
│   ├── hooks/               ←   React hooks only — `use-*.ts` files (incl. screen hooks)
│   ├── store/               ←   Zustand stores — filename `<feature>-store.ts`
│   ├── utils/               ←   pure helpers used by hooks/components (formatters, classifiers)
│   └── types/               ←   interfaces, types, domain models — `<topic>.ts`
├── hooks/                   ← Global hooks used across features
├── lib/                     ← Core utilities (motion.ts, confirm.ts, storage.ts, cn.ts)
└── constants/               ← Theme fallbacks, config
```

## Screens live in `src/app/` — logic lives in the feature

Expo Router treats every file in `src/app/` as a route, so **never put non-route files
(hooks, helpers, subcomponents) in `src/app/`**. The route file holds the screen's JSX
(default export, `function` declaration). When a screen has real logic — state
coordinating features, derived values, complex handlers — extract it into a colocated
screen hook in the feature:

```tsx
// src/app/settings.tsx — screen UI only
import { useSettingsScreen } from '@/features/settings/hooks/use-settings-screen';

export default function SettingsScreen() {
  const { profile, onSave, onChangeName } = useSettingsScreen();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-5 pt-safe-offset-2 pb-safe-offset-22 gap-6">
      ...
    </ScrollView>
  );
}
```

```ts
// src/features/settings/hooks/use-settings-screen.ts — all logic
export const useSettingsScreen = () => {
  const router = useRouter();
  const profile = useSettingsStore((s) => s.profile);
  ...
  return { profile, onSave, onChangeName };
};
```

- Reading route params (`useLocalSearchParams`) happens in the route file and is passed
  into the hook/components as arguments — keeps the logic testable.
- Navigation calls (`router.push`, `router.back`) live inside the hook, not the JSX.
- `_layout.tsx` files are also UI-only — extract logic into a feature hook.
- A trivial screen (a static section or a single `useState`) does not need a screen
  hook — don't create a wrapper that forwards unrelated hooks.

## One component per file

Never define multiple components in the same file. If you need a subcomponent, give it
its own file under the feature's `components/`.

**Exception:** tiny, truly private render helpers (< 10 lines, no hooks, used once) can
stay in the same file. If it has hooks or grows, extract it.

## Component folder structure

A feature component with a colocated hook lives in a folder together. Simple components
with no hook stay as a single file.

```
// ✅ Component with hook — folder
src/features/workouts/components/workout-card/
├── workout-card.tsx
└── use-workout-card.ts

// ✅ Simple component — single file
src/features/workouts/components/set-badge.tsx
```

## Feature folder responsibilities

- **`hooks/` is strictly React hooks.** Every file starts with `use-` and exports a
  `use*` function. No plain helpers, no stores.
- **Stores live in `store/`, not `hooks/`.** A Zustand store is state — it exposes a hook
  accessor, but the file is fundamentally a store definition. File is `<feature>-store.ts`;
  the export keeps the `useXxxStore` name. See `rules/state-management.md`.
- **Helpers live in `utils/`.** When a hook or store needs a non-trivial helper (data
  normalization, formatters, classifiers), extract it so it's independently testable.

```
❌ features/workouts/hooks/use-workouts-store.ts   → move to features/workouts/store/workouts-store.ts
❌ helper functions defined at the top of a hook file → extract to features/workouts/utils/<topic>.ts
```

## Type definitions live in `types/`

Place `interface` / `type` definitions in a dedicated file under `<feature>/types/`.
Never declare them inline with the hook, store, or util that consumes them.

```ts
// ✅ src/features/workouts/types/workout.ts
export interface Workout {
  id: string;
  name: string;
  completedAt: number | null;
}

// ✅ src/features/workouts/store/workouts-store.ts
import type { Workout } from '@/features/workouts/types/workout';
```

**Component prop types are the exception** — they stay inline directly above the
component (`type WorkoutCardProps = { … }` above `export function WorkoutCard(...)`).
Everything else — hook return shapes, store shapes, helper records, domain models —
lives under `types/`.

## Hook placement

| Scope | Location |
|-------|----------|
| Used by **one** component | Colocated in that component's folder, named `use-<component>.ts` |
| Used across components in **one** feature | `src/features/<feature>/hooks/` |
| Used across **multiple** features | `src/hooks/` |

## No barrel `index.ts` files

**Never create `index.ts` barrel files inside `src/`.** Import directly from the file.

```ts
// ❌ Don't — barrel re-export
import { WorkoutCard } from '@/features/workouts/components';

// ✅ Do — direct import
import { WorkoutCard } from '@/features/workouts/components/workout-card/workout-card';
```

Barrel files eagerly pull in their entire transitive module graph, slowing Metro cold
starts, HMR, and lint. Never use `export *`.
