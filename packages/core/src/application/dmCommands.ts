/** Direct-message commands shared by the clients: pinning, closing, opening and leaving conversations. */
import type { ApiPort } from './ports/api';
import { useClosedDmStore } from './stores/closedDmStore';
import { useGuildStore } from './stores/guildStore';
import { useSessionStore } from './stores/sessionStore';
import type { Channel } from '../contracts/rest';
import { MAX_PINNED_DMS, withPin, withoutPin } from '../domain/pins';

export const pinnedDmIds = (): string[] => useSessionStore.getState().settings.pinned_dm_channel_ids ?? [];

/**
 * Pins or unpins a DM (at most {@link MAX_PINNED_DMS}), showing the change at once and syncing it to the user's other devices.
 * Resolves false when nothing changed (pin limit reached); a failed save undoes the change and throws.
 */
export async function setDmPinned(api: Pick<ApiPort, 'updateSettings'>, channelId: string, pinned: boolean): Promise<boolean> {
  const current = pinnedDmIds();
  const next = pinned ? withPin(current, channelId, MAX_PINNED_DMS) : withoutPin(current, channelId);
  if (!next || next === current) return false;
  useSessionStore.getState().setSettings({ pinned_dm_channel_ids: next });
  try {
    await api.updateSettings({ pinned_dm_channel_ids: next });
    return true;
  } catch (error) {
    useSessionStore.getState().setSettings({ pinned_dm_channel_ids: current });
    throw error;
  }
}

/** Hides a DM from the list until a newer message arrives. A pinned DM is unpinned first; a failed unpin leaves the DM open and throws. */
export async function closeDm(api: Pick<ApiPort, 'updateSettings'>, channelId: string): Promise<void> {
  if (pinnedDmIds().includes(channelId)) await setDmPinned(api, channelId, false);
  useClosedDmStore.getState().close(channelId, useGuildStore.getState().channels[channelId]?.last_message_id);
}

/** Makes sure the DM (or group DM, for several people) exists and is listed, reopening a closed one. */
export async function openDm(api: Pick<ApiPort, 'openPrivateChannel'>, userIds: string[]): Promise<Channel> {
  const channel = await api.openPrivateChannel(userIds);
  useGuildStore.getState().upsertChannel(channel);
  useClosedDmStore.getState().reopen(channel.id);
  return channel;
}

/** Leaves a group DM and forgets it locally. */
export async function leaveGroupDm(api: Pick<ApiPort, 'removeGroupRecipient'>, channelId: string): Promise<void> {
  await api.removeGroupRecipient(channelId, '@me');
  useGuildStore.getState().removeChannel(channelId);
  useClosedDmStore.getState().reopen(channelId);
}
