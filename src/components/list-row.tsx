import { Ionicons } from '@expo/vector-icons';
import { PressableFeedback, useThemeColor } from 'heroui-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Presets } from 'react-native-pulsar';

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Leading accessory — an icon or avatar. */
  left?: ReactNode;
  /** Trailing accessory — a value or badge, shown BEFORE the chevron. */
  right?: ReactNode;
  /** If set, the row is pressable AND shows a chevron. If omitted, there is NO chevron and
   *  the row is not pressable — so a chevron can never be a dead "fake button". */
  onPress?: () => void;
};

/**
 * A list / settings / "see details" row. The chevron is COUPLED to onPress: pass onPress
 * and the row is pressable with a trailing chevron; omit it and there's no chevron at all.
 * This makes the recurring "chevron that does nothing" defect structurally impossible —
 * anything that looks tappable IS tappable.
 *
 * The anti-slop lint forbids bare chevron icons outside this file, so EVERY tappable row
 * routes through here. Use it for settings rows, history items that open a detail, exercise
 * list items, "see all" rows — anywhere a row navigates or acts.
 *
 *   <ListRow title="Bench Press" subtitle="Chest · 4 sets" onPress={() => router.push(`/exercise/${id}`)} />
 *   <ListRow title="Units" right={<Text className="text-muted">kg</Text>} />   // not tappable — no chevron
 */
export function ListRow({ title, subtitle, left, right, onPress }: ListRowProps) {
  const muted = useThemeColor('muted');
  const body = (
    <View className="flex-row items-center gap-3 py-3" style={{ minHeight: 44 }}>
      {left}
      <View className="flex-1 gap-0.5">
        <Text className="text-base text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={muted} /> : null}
    </View>
  );
  if (!onPress) return body;
  // HeroUI's PressableFeedback gives the row a built-in scale press animation; the selection
  // haptic on press makes every tap feel responsive (nicer than a bare RN Pressable).
  return (
    <PressableFeedback
      onPress={() => {
        Presets.System.selection();
        onPress();
      }}>
      {body}
    </PressableFeedback>
  );
}
