import { Presets } from 'react-native-pulsar';

/** Fire the standard selection haptic (Pulsar). Internal copy of
 *  src/components/pressable's helper, vendored so this package never reaches
 *  back into src. */
export function pressHaptic(): void {
  Presets.System.selection();
}
