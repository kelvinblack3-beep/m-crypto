import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SettingsState } from '@/features/settings/types/settings-state';
import { zustandStorage } from '@/lib/storage';

/**
 * Example feature store — the pattern EVERY app store follows: one Zustand store per
 * domain under src/features/<feature>/store/<feature>-store.ts, its state type in the
 * feature's types/, persisted with MMKV via zustandStorage, actions next to the state
 * they mutate. Screens render from the store; controls mutate it; data survives a
 * reload. See rules/state-management.md.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      density: 'cozy',
      setDensity: (density) => set({ density }),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
