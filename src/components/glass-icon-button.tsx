import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useThemeColor } from 'heroui-native';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/pressable';

type GlassIconButtonProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  /** Icon size; the button is a 44pt circle regardless. */
  size?: number;
};

/**
 * A floating chrome icon button — LIQUID GLASS on iOS 26+, a translucent surface
 * everywhere else. GlassView silently degrades to a plain (invisible) View on
 * unsupported platforms, so the fallback branch renders a real surface — Android
 * must never show a blank/invisible control over a photo.
 *
 * Use it for EVERY control that floats OVER content: the back button on a
 * transparent-header hero detail, share/heart actions over a photo, icon actions
 * on a transparent header. Haptic + press feedback come from <Pressable>.
 *
 *   <GlassIconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
 */
export function GlassIconButton({ icon, onPress, accessibilityLabel, size = 20 }: GlassIconButtonProps) {
  const foreground = useThemeColor('foreground');

  const inner = <Ionicons name={icon} size={size} color={foreground} />;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
      {isLiquidGlassAvailable() ? (
        <GlassView style={styles.circle} glassEffectStyle="regular" isInteractive>
          {inner}
        </GlassView>
      ) : (
        <View className="size-11 items-center justify-center rounded-full border border-border bg-surface/80">
          {inner}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // GlassView is a native surface Uniwind can't style — StyleSheet is sanctioned here.
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
