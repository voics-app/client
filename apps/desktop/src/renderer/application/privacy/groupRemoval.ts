/**
 * MLS member removal for Ephemeral channels. Compares the devices inside the
 * channel's MLS group with the devices that should be there (current channel/guild
 * participants and their current device lists) and, when this device is the elected
 * committer, issues a Remove commit. The epoch change rotates every group secret, so
 * removed devices can no longer decrypt later messages or derive later media keys.
 */
import type { CryptoBridge } from '@shared/ipc';
import type { DeviceDirectory } from './deviceDirectory';
import { participantsOf } from './deviceDirectory';
import type { SelfIdentity } from './types';

/** deviceId -> userId of every device in the MLS group, as known to this device. */
export type Membership = Record<string, string>;

interface Expected {
  deviceId: string;
  userId: string;
}

export interface RemovalOutcome {
  membership: Membership;
  /** Present when this device committed a removal; the commit must be relayed to `recipients`. */
  commit?: { commitB64: string; epoch: number; recipients: { user_id: string; device_id: string }[] };
}

export interface RemovalDeps {
  crypto: CryptoBridge;
  devices: DeviceDirectory;
  self: SelfIdentity;
}

async function expectedDevices(deps: RemovalDeps, channelId: string): Promise<Map<string, Expected>> {
  const expected = new Map<string, Expected>();
  for (const userId of participantsOf(channelId, deps.self.userId)) {
    for (const device of await deps.devices.devices(userId, true)) {
      expected.set(device.identity_key_b64, { deviceId: device.device_id, userId });
    }
  }
  expected.set(deps.self.identityKeyB64, { deviceId: deps.self.deviceId, userId: deps.self.userId });
  return expected;
}

/**
 * Elects the committer among the devices that stay: the lowest identity keys go first, and
 * `attempt` widens the field so a retry after a lost commit race (or an offline elected
 * device) is taken over by the next device. `force` skips the election (sending path).
 */
export function mayCommit(remainingKeys: readonly string[], ownKey: string, attempt: number, force: boolean): boolean {
  if (force) return true;
  const rank = [...remainingKeys].sort().indexOf(ownKey);
  return rank >= 0 && rank <= attempt;
}

export async function removeStaleDevices(
  deps: RemovalDeps,
  channelId: string,
  membership: Membership,
  options: { attempt?: number; force?: boolean } = {},
): Promise<RemovalOutcome> {
  const { crypto, self } = deps;
  const expected = await expectedDevices(deps, channelId);
  const groupKeys = await crypto.memberKeys(channelId);
  const stale = groupKeys.filter((key) => key !== self.identityKeyB64 && !expected.has(key));
  const remaining = groupKeys.filter((key) => !stale.includes(key));

  const keptDevices = new Set([...expected.values()].map((e) => e.deviceId));
  const pruned = Object.fromEntries(Object.entries(membership).filter(([deviceId]) => keptDevices.has(deviceId)));
  if (stale.length === 0) return { membership: pruned };
  if (!mayCommit(remaining, self.identityKeyB64, options.attempt ?? 0, options.force ?? false)) return { membership };

  const result = await crypto.removeMembers(channelId, stale);
  if (!result) return { membership: pruned };
  const recipients = remaining
    .filter((key) => key !== self.identityKeyB64)
    .flatMap((key) => {
      const device = expected.get(key);
      return device ? [{ user_id: device.userId, device_id: device.deviceId }] : [];
    });
  return { membership: pruned, commit: { commitB64: result.commitB64, epoch: result.epoch, recipients } };
}
