import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { buildCustomStatus, type ManualStatus } from '@discordy/core/domain/selfPresence';
import { getRuntime } from '../runtime';
import { currentMobilePresence, rememberMobileStatus } from '../runtime/mobilePresence';
import { attempt } from '../ui/attempt';

/** Sends this device's effective status and custom status to the gateway so everyone sees the change. */
function publishPresence(): void {
  getRuntime().gateway.send(GatewayOp.PRESENCE_UPDATE, currentMobilePresence());
}

/** Sets Online, Idle, Do not disturb or Invisible: shown at once, published, then saved to the account (desktop's order). */
export function setStatus(status: ManualStatus): Promise<unknown> {
  useSessionStore.getState().setSettings({ status });
  rememberMobileStatus(status);
  publishPresence();
  return attempt(() => getRuntime().api.updateSettings({ status }), 'Could not update status');
}

/** Saves the custom status text with its expiry; empty text clears it. */
export function setCustomStatus(text: string, expiresAt: string | null): Promise<unknown> {
  const custom_status = buildCustomStatus(text, expiresAt);
  useSessionStore.getState().setSettings({ custom_status });
  publishPresence();
  return attempt(() => getRuntime().api.updateSettings({ custom_status }), 'Could not update status');
}
