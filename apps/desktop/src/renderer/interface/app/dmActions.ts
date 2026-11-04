import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { attempt } from './actions';
import { pinnedDmIds, setDmPinned } from './pinActions';
import { getRuntime } from './runtime';

/** Hides a DM from the list until a newer message arrives (a pinned DM is unpinned); leaves the conversation view if it was open. */
export function closeDm(channelId: string): void {
  if (pinnedDmIds().includes(channelId)) void setDmPinned(channelId, false);
  const channel = useGuildStore.getState().channels[channelId];
  useClosedDmStore.getState().close(channelId, channel?.last_message_id);
  const ui = useUiStore.getState();
  if (ui.view.channelId === channelId) ui.navigate({ kind: 'home', channelId: null });
}

/** Makes sure the 1:1 DM with a user exists and is listed (a closed one is reopened); resolves to its id. */
export async function ensureDm(userId: string): Promise<string | null> {
  const channel = await attempt(() => getRuntime().api.openPrivateChannel([userId]), 'Could not open conversation');
  if (!channel) return null;
  useGuildStore.getState().upsertChannel(channel);
  useClosedDmStore.getState().reopen(channel.id);
  return channel.id;
}

/** Leaves a group DM (ownership moves to a remaining member when the owner leaves). */
export async function leaveGroupDm(channelId: string): Promise<void> {
  const ok = await attempt(async () => {
    await getRuntime().api.removeGroupRecipient(channelId, '@me');
    return true;
  }, 'Could not leave the group');
  if (!ok) return;
  useGuildStore.getState().removeChannel(channelId);
  useClosedDmStore.getState().reopen(channelId);
  const ui = useUiStore.getState();
  ui.openDialog(null);
  if (ui.view.channelId === channelId) ui.navigate({ kind: 'home', channelId: null });
}
