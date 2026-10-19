/**
 * Opt-in diagnostics for the private delivery modes: `localStorage['discordy.debug.privacy'] = '1'`
 * logs each step of sending and receiving (never message content or key material).
 */
export function privacyDebug(step: string, detail: Record<string, unknown> = {}): void {
  let enabled = false;
  try {
    enabled = globalThis.localStorage?.getItem('discordy.debug.privacy') === '1';
  } catch {
    enabled = false;
  }
  if (enabled) console.info(`[privacy] ${step}`, detail);
}
