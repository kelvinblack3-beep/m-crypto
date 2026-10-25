import { Alert } from 'react-native';
import { Presets } from 'react-native-pulsar';

type ConfirmDeleteOptions = {
  /** Dialog title, e.g. "Delete workout?". */
  title?: string;
  /** Optional explanatory line, e.g. "This can't be undone.". */
  message?: string;
  /** Label for the destructive button (default "Delete"). */
  confirmLabel?: string;
  /** Runs ONLY if the user confirms. */
  onConfirm: () => void;
};

/**
 * Confirm before a destructive action. EVERY delete / remove / clear MUST go through this —
 * never delete directly on tap. Shows the native confirm dialog with a red destructive
 * button + Cancel, plus a warning haptic.
 *
 *   onPress={() => confirmDelete({ title: 'Delete workout?', onConfirm: () => removeWorkout(id) })}
 */
export function confirmDelete({ title = 'Delete?', message, confirmLabel = 'Delete', onConfirm }: ConfirmDeleteOptions): void {
  Presets.System.notificationWarning();
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
