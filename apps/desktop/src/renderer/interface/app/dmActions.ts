import { useClosedDmStore } from '@renderer/application/stores/closedDmStore';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { attempt } from './actions';
import { getRuntime } from './runtime';

/** Hides a DM from the list until a newer message arrives; leaves the conversation view if it was open. */
export function closeDm(channelId: string): void {
  const channel = useGuildStore.getState().channels[channelId];
  useClosedDmStore.getState().close(channelId, channel?.last_message_id);
  const ui = useUiStore.getState();
  if (ui.view.channelId === channelId) ui.navigate({ kind: 'home', channelId: null });
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
