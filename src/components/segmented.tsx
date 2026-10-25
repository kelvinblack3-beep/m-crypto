import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { useThemeColor } from 'heroui-native';

type SegmentedProps<T extends string> = {
  /** The option values, in order (e.g. ['system','light','dark']). */
  values: readonly T[];
  /** The currently-selected value. */
  value: T;
  onChange: (value: T) => void;
  /** Display labels for the segments, if different from the values (e.g. ['Auto','Light','Dark']). */
  labels?: readonly string[];
};

/**
 * The standard segmented control — the NATIVE platform control (iOS UISegmentedControl /
 * Android segmented buttons) from @expo/ui, tinted with the accent token. Use it for ANY
 * small either/or-of-a-few choice: a theme switch (System / Light / Dark), units (kg / lbs),
 * a list filter, a tab-like toggle. Don't hand-roll segmented pills out of Pressables — the
 * native control is consistent, accessible, and gives its own press feedback.
 *
 *   <Segmented values={['system','light','dark']} labels={['Auto','Light','Dark']}
 *     value={mode} onChange={setMode} />
 */
export function Segmented<T extends string>({ values, value, onChange, labels }: SegmentedProps<T>) {
  const accent = useThemeColor('accent');
  const selectedIndex = Math.max(0, values.indexOf(value));
  return (
    <SegmentedControl
      values={(labels ?? values) as string[]}
      selectedIndex={selectedIndex}
      tintColor={accent}
      onChange={(e) => {
        const i = e.nativeEvent.selectedSegmentIndex;
        if (values[i] !== undefined) onChange(values[i]);
      }}
    />
  );
}
