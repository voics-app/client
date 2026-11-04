import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { MAX_PINNED_DMS, MAX_PINNED_PER_GUILD, pinnedChannelsOf, withPin, withoutPin } from '@renderer/domain/pins';
import type { UserSettings } from '@shared/contracts/rest';
import { attempt } from './actions';
import { getRuntime } from './runtime';

/** Applies a settings patch locally right away, then syncs it to the user's other devices; reverts on failure. */
async function savePins(patch: Pick<UserSettings, 'pinned_dm_channel_ids' | 'pinned_channel_ids'>): Promise<void> {
  const session = useSessionStore.getState();
  const previous = { pinned_dm_channel_ids: session.settings.pinned_dm_channel_ids, pinned_channel_ids: session.settings.pinned_channel_ids };
  session.setSettings(patch);
  const saved = await attempt(() => getRuntime().api.updateSettings(patch), 'Could not save pins');
  if (!saved) useSessionStore.getState().setSettings(previous);
}

export function pinnedDmIds(): string[] {
  return useSessionStore.getState().settings.pinned_dm_channel_ids ?? [];
}

export function pinnedIdsIn(guildId: string): string[] {
  return pinnedChannelsOf(useSessionStore.getState().settings.pinned_channel_ids, guildId);
}

export async function setDmPinned(channelId: string, pinned: boolean): Promise<void> {
  const current = pinnedDmIds();
  const next = pinned ? withPin(current, channelId, MAX_PINNED_DMS) : withoutPin(current, channelId);
  if (!next || next === current) return;
  await savePins({ pinned_dm_channel_ids: next });
}

export async function setChannelPinned(guildId: string, channelId: string, pinned: boolean): Promise<void> {
  const current = pinnedIdsIn(guildId);
  const next = pinned ? withPin(current, channelId, MAX_PINNED_PER_GUILD) : withoutPin(current, channelId);
  if (!next || next === current) return;
  const all = { ...useSessionStore.getState().settings.pinned_channel_ids, [guildId]: next };
  if (next.length === 0) delete all[guildId];
  await savePins({ pinned_channel_ids: all });
}
