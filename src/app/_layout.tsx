import '@/global.css';

import Constants from 'expo-constants';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { HeroUINativeProvider } from 'heroui-native';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Newly } from '@newly/sdk-react-native';

import { ThemeSwitchHost } from '@/components/theme-switch-host';
import { hideExpoDeveloperUi } from '@/lib/dev-menu';
import generatedAnalytics from '@/lib/newly-analytics.json';

type NewlyAnalyticsExtra = {
  newlyAnalyticsEnabled?: unknown;
  newlyAnalyticsSamplingRate?: unknown;
  newlyApiUrl?: unknown;
  newlyIngestKey?: unknown;
};

// Newly writes this project's own analytics settings into src/lib/newly-analytics.json,
// which ships empty. They are deliberately NOT in app.json `expo.extra`: everything under
// `extra` is a native input, so a per-project value there gives the project its own
// fingerprint and costs it a full native build instead of the shared pre-built shell.
// Projects scaffolded before the move still carry the four keys in `extra`, so that stays
// the fallback.
const generated = generatedAnalytics as {
  ingestKey?: string;
  apiUrl?: string;
  enabled?: boolean;
  samplingRate?: number | null;
};
const analyticsExtra = (Constants.expoConfig?.extra ?? {}) as NewlyAnalyticsExtra;
const analytics = generated.ingestKey
  ? {
      ingestKey: generated.ingestKey,
      apiUrl: generated.apiUrl,
      enabled: generated.enabled,
      sampling: generated.samplingRate,
    }
  : {
      ingestKey: analyticsExtra.newlyIngestKey,
      apiUrl: analyticsExtra.newlyApiUrl,
      enabled: analyticsExtra.newlyAnalyticsEnabled,
      sampling: analyticsExtra.newlyAnalyticsSamplingRate,
    };

const newlyIngestKey = typeof analytics.ingestKey === 'string' ? analytics.ingestKey : '';
const newlyApiUrl = typeof analytics.apiUrl === 'string' ? analytics.apiUrl : '';
const newlyAnalyticsSampling = typeof analytics.sampling === 'number' ? analytics.sampling : undefined;

// Expo's floating gear and developer menu belong to whoever is debugging Expo, not to
// the person looking at their own app. See src/lib/dev-menu.ts for why this is JS and
// not an app.json plugin option.
hideExpoDeveloperUi();

if (analytics.enabled !== false && newlyIngestKey && newlyApiUrl) {
  Newly.init({
    ingestKey: newlyIngestKey,
    apiUrl: newlyApiUrl,
    sampling: newlyAnalyticsSampling,
  });
}

// Color scheme is driven by app.json `userInterfaceStyle` (automatic / light / dark) —
// set by the design system at lock time. Uniwind follows the system color scheme by
// default (adaptive themes), so the HeroUI/Uniwind design tokens switch light/dark on
// their own; we only mirror it into React Navigation's theme here.
//
// KeyboardProvider (react-native-keyboard-controller) is mounted once at the root so any
// screen can use KeyboardAwareScrollView / keyboard hooks for proper form handling — this
// is the keyboard library the design system mandates over RN's KeyboardAvoidingView. It is
// pre-baked into the scaffold (along with MMKV for persistence and Skia for charts) so the
// native module set is fixed up front and screen work hot-reloads without a native rebuild.
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <HeroUINativeProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            {/* ThemeSwitchHost is always mounted (zero cost when unused) so any theme
                toggle switches via useThemeSwitch() and the circular reveal plays. */}
            <ThemeSwitchHost>
              {/* The scaffold boots straight into src/app/index.tsx (the Newly welcome
                  screen), no tab bar. src/components/app-tabs.tsx is the NativeTabs
                  reference: when the app has tab routes, render <AppTabs /> here
                  instead of <Slot /> (explore.tsx is its second tab). */}
              <Slot />
            </ThemeSwitchHost>
          </ThemeProvider>
        </HeroUINativeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
