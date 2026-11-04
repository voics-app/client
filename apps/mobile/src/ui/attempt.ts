import { Alert } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';

/** Runs an action; resolves to its value, or alerts the failure (with the server's message) and resolves to undefined. */
export async function attempt<T>(run: () => Promise<T>, title: string): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    Alert.alert(title, errorMessage(error));
    return undefined;
  }
}

/** A yes/no question before something destructive; runs `onConfirm` only on the destructive button. */
export function confirmDestructive(title: string, body: string, confirmLabel: string, onConfirm: () => void): void {
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
