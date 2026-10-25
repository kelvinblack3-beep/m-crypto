import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

/** The app's single MMKV instance — synchronous, on-device key-value storage. Don't
 *  create more instances and don't reach for AsyncStorage; everything persists here. */
export const storage = createMMKV();

/**
 * Zustand persist adapter backed by MMKV. Every store uses it:
 *
 *   import { create } from 'zustand';
 *   import { createJSONStorage, persist } from 'zustand/middleware';
 *   import { zustandStorage } from '@/lib/storage';
 *
 *   export const useWorkoutsStore = create<WorkoutsState>()(
 *     persist((set) => ({ ... }), {
 *       name: 'workouts',
 *       storage: createJSONStorage(() => zustandStorage),
 *     }),
 *   );
 *
 * See rules/state-management.md for the full store pattern.
 */
export const zustandStorage: StateStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.remove(name),
};
