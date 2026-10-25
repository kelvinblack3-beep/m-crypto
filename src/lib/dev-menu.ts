import { requireOptionalNativeModule } from 'expo';

/**
 * Keep Expo's developer UI out of the app someone is building.
 *
 * A Newly preview runs a dev client, so expo-dev-client draws a floating gear over the
 * app and opens its developer menu (Reload, Go home, element inspector, DevTools) behind
 * it. That belongs to whoever is debugging Expo, not to someone looking at their own app,
 * and it reads as part of their app or as a Newly bug.
 *
 * Done from JS rather than through app.json's expo-dev-client plugin options, which is
 * the documented route, for one reason: app.json is a native fingerprint input, so setting
 * it there gives the scaffold a new fingerprint, every fresh project stops matching the
 * pre-built shell every environment pins, and each one pays a ~470s native build instead
 * (NEW-2506 measured 9 minutes). Ordinary JS is not a fingerprint input, so this line
 * costs nobody a build.
 *
 * It works because the plist/manifest values are only REGISTERED DEFAULTS in
 * UserDefaults; `DevMenuPreferences.setPreferencesAsync` writes the live value and its
 * setter calls `DevMenuManager.shared.updateFABVisibility()`, so the gear goes away
 * without a relaunch (expo-dev-menu@57, ios/Modules/DevMenuPreferences.swift).
 *
 * The module is internal — expo-dev-menu's JS package exports only openMenu/hideMenu/
 * closeMenu/registerDevMenuItems — so it is reached optionally and every failure is
 * swallowed: a production build has no dev menu, and nothing here may ever take the app
 * down. The gear is drawn from launch until this runs, so expect it for a frame or two.
 *
 * The menu itself is still reachable by shake / Cmd+D, which no preview viewer can send.
 */
type DevMenuPreferences = {
  setPreferencesAsync?: (settings: Record<string, boolean>) => Promise<void>;
};

export function hideExpoDeveloperUi(): void {
  try {
    const preferences = requireOptionalNativeModule<DevMenuPreferences>('DevMenuPreferences');
    void preferences?.setPreferencesAsync?.({
      showFloatingActionButton: false,
      showsAtLaunch: false,
      isOnboardingFinished: true,
    }).catch(() => undefined);
  } catch {
    // No dev menu in this build. Nothing to hide.
  }
}
