import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { setDmPinned as coreSetDmPinned } from '@discordy/core/application/dmCommands';
import { MAX_PINNED_PER_GUILD, pinnedChannelsOf, withPin, withoutPin } from '@discordy/core/domain/pins';
import type { UserSettings } from '@discordy/core/contracts/rest';
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

export { pinnedDmIds } from '@discordy/core/application/dmCommands';

export function pinnedIdsIn(guildId: string): string[] {
  return pinnedChannelsOf(useSessionStore.getState().settings.pinned_channel_ids, guildId);
}

export async function setDmPinned(channelId: string, pinned: boolean): Promise<void> {
  await attempt(() => coreSetDmPinned(getRuntime().api, channelId, pinned), 'Could not save pins');
}

export async function setChannelPinned(guildId: string, channelId: string, pinned: boolean): Promise<void> {
  const current = pinnedIdsIn(guildId);
  const next = pinned ? withPin(current, channelId, MAX_PINNED_PER_GUILD) : withoutPin(current, channelId);
  if (!next || next === current) return;
  const all = { ...useSessionStore.getState().settings.pinned_channel_ids, [guildId]: next };
  if (next.length === 0) delete all[guildId];
  await savePins({ pinned_channel_ids: all });
}
