# State Management

## Impact: CRITICAL

The app is **local-first**: real on-device state, no backend unless the user explicitly asks (see `rules/data-fetching.md`). All app data lives in **Zustand stores persisted with MMKV** — never scattered `useState` copies, never data hardcoded in JSX.

## One source of truth

- The app's domain data lives in a Zustand store in `src/features/<feature>/store/<feature>-store.ts`. A simple app has one domain feature and therefore one store; don't create parallel stores that hold copies of the same data.
- **Screens RENDER from the store; controls MUTATE the store; data SURVIVES a reload.** Never copy store data into `useState` across screens.
- `useState` is for genuinely local, ephemeral UI state only: an open/closed flag, an in-progress form draft, a selected tab.

## Store shape

State type in `types/`, store in `store/`, persisted via `zustandStorage` from `@/lib/storage`:

```ts
// src/features/workouts/types/workouts-state.ts
import type { Workout } from '@/features/workouts/types/workout';

export interface WorkoutsState {
  workouts: Workout[];
  addWorkout: (workout: Workout) => void;
  removeWorkout: (id: string) => void;
}
```

```ts
// src/features/workouts/store/workouts-store.ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';
import type { WorkoutsState } from '@/features/workouts/types/workouts-state';

export const useWorkoutsStore = create<WorkoutsState>()(
  persist(
    (set) => ({
      workouts: [],
      addWorkout: (workout) => set((s) => ({ workouts: [workout, ...s.workouts] })),
      removeWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),
    }),
    {
      name: 'workouts',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
```

- File is `<feature>-store.ts`; the export keeps the `useXxxStore` name.
- Actions live IN the store next to the state they mutate — components never `setState` store data shape by hand.
- Derived values (totals, streaks, filtered views) are computed in hooks/selectors, not duplicated as stored state.

## Select narrowly

Subscribe to the slice you use, so unrelated updates don't re-render the component:

```ts
// ✅ Correct — narrow selectors
const workouts = useWorkoutsStore((s) => s.workouts);
const addWorkout = useWorkoutsStore((s) => s.addWorkout);

// ❌ Wrong — subscribes to the whole store
const { workouts, addWorkout } = useWorkoutsStore();
```

Outside React (callbacks, utilities): `useWorkoutsStore.getState().addWorkout(…)`.

## Seed, don't fake

On first launch, seed realistic sample data INTO the store (a few history items, a small library) so the app feels alive — but it must be REAL store data the user can add to, edit, and delete. Never bake display data into a component as literals. Guard the seed so it runs once:

```ts
{
  name: 'workouts',
  storage: createJSONStorage(() => zustandStorage),
  onRehydrateStorage: () => (state) => {
    if (state && state.workouts.length === 0) state.addWorkout(...seedWorkouts);
  },
}
```

(Or an explicit `seeded` flag in the store — either way, seeding never overwrites user data.)

## Persistence notes

- `@/lib/storage` exports the MMKV instance and the `zustandStorage` adapter — use them; don't create new MMKV instances or reach for AsyncStorage.
- Persist only what should survive: use `partialize` to exclude transient state (an in-flight timer, a draft) from persistence.
- MMKV is synchronous — no `await`, no loading gate needed for store reads after rehydration.
