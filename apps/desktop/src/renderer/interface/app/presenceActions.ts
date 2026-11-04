import { currentPresence } from '@renderer/application/selfPresence';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { getRuntime } from './runtime';

/** Sends this device's effective status and custom status activity to the gateway. */
export function publishPresence(): void {
  getRuntime().gateway.send(GatewayOp.PRESENCE_UPDATE, currentPresence());
}
