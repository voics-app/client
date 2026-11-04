/** Cached lookup of user devices and their identity keys, plus channel participant resolution. */
import type { Device } from '@discordy/core/contracts/rest';
import type { ApiPort } from '../ports/api';
import { useGuildStore } from '../stores/guildStore';

const TTL_MS = 60_000;

export class DeviceDirectory {
  private readonly cache = new Map<string, { at: number; devices: Device[] }>();

  constructor(
    private readonly api: Pick<ApiPort, 'listUserDevices'>,
    private readonly now: () => number,
  ) {}

  async devices(userId: string, force = false): Promise<Device[]> {
    const hit = this.cache.get(userId);
    if (!force && hit && this.now() - hit.at < TTL_MS) return hit.devices;
    const devices = await this.api.listUserDevices(userId);
    this.cache.set(userId, { at: this.now(), devices });
    return devices;
  }

  async identityKey(userId: string, deviceId: string): Promise<string | null> {
    let device = (await this.devices(userId)).find((d) => d.device_id === deviceId);
    if (!device) device = (await this.devices(userId, true)).find((d) => d.device_id === deviceId);
    return device?.identity_key_b64 ?? null;
  }

  /** Finds which of `userIds` owns `deviceId` (refreshing the cache once on a miss). */
  async ownerOf(userIds: readonly string[], deviceId: string): Promise<string | null> {
    for (const force of [false, true]) {
      for (const userId of userIds) {
        if ((await this.devices(userId, force)).some((d) => d.device_id === deviceId)) return userId;
      }
    }
    return null;
  }

  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }
}

/** User ids taking part in a channel, always including `selfUserId`. */
export function participantsOf(channelId: string, selfUserId: string): string[] {
  const { channels, members } = useGuildStore.getState();
  const channel = channels[channelId];
  if (!channel) return [selfUserId];
  const ids = channel.guild_id ? Object.keys(members[channel.guild_id] ?? {}) : (channel.recipients ?? []).map((u) => u.id);
  return [...new Set([selfUserId, ...ids])];
}
