import { deviceStorage } from '../ports/deviceStorage';

/**
 * Opt-in diagnostics for the private delivery modes: the device-storage key `discordy.debug.privacy` set to `'1'` (localStorage on desktop)
 * logs each step of sending and receiving (never message content or key material).
 */
export function privacyDebug(step: string, detail: Record<string, unknown> = {}): void {
  let enabled = false;
  try {
    enabled = deviceStorage.getItem('discordy.debug.privacy') === '1';
  } catch {
    enabled = false;
  }
  if (enabled) console.info(`[privacy] ${step}`, detail);
}
