import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from 'heroui-native';
import { useRef } from 'react';
import { useColorScheme, View } from 'react-native';

import { Pressable } from '@/components/pressable';
import { type ThemeChoice, useThemeSwitch } from '@/components/theme-switch-host';

type ThemeToggleButtonProps = {
  /** Icon size; the touch target stays 44pt regardless. */
  size?: number;
  /** Called with the theme just applied — persist it in the store here (Zustand + MMKV). */
  onSwitched?: (next: ThemeChoice) => void;
};

/**
 * THE theme control — a one-tap sun/moon icon button. The icon shows the ACTION
 * (sun while dark: tap to go light; moon while light: tap to go dark); each tap
 * switches DIRECTLY light↔dark through useThemeSwitch, so the circular reveal
 * radiates from this button. NEVER build a theme dialog, menu, or three-option
 * System/Light/Dark control — one tap, one switch.
 *
 * The button's window center is measured ONCE on layout into a ref and read
 * synchronously on press (a per-tap measure adds a visible hitch on busy UI
 * threads). Haptic + press feedback come from the <Pressable> primitive.
 *
 *   // In the screen's title row:
 *   <View className="flex-row items-end justify-between gap-3">
 *     <Text className="text-3xl font-bold text-foreground">Settings</Text>
 *     <ThemeToggleButton onSwitched={setSavedTheme} />
 *   </View>
 */
export function ThemeToggleButton({ size = 20, onSwitched }: ThemeToggleButtonProps) {
  const scheme = useColorScheme();
  const switchTheme = useThemeSwitch();
  const foreground = useThemeColor('foreground');
  const ref = useRef<View>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const isDark = scheme === 'dark';

  const onLayout = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      origin.current = { x: x + w / 2, y: y + h / 2 };
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onPress={() => {
        const next: ThemeChoice = isDark ? 'light' : 'dark';
        switchTheme(next, origin.current ?? undefined);
        onSwitched?.(next);
      }}
    >
      <View ref={ref} onLayout={onLayout} className="size-11 items-center justify-center rounded-full">
        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={size} color={foreground} />
      </View>
    </Pressable>
  );
}
