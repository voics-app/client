/** Moderator actions that span several messages or members. Each reports failure with a toast. */
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMessageStore } from '@renderer/application/stores/messageStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { bulkDeletePlan, purgeableMessageIds } from '@discordy/core/domain/moderationTools';
import { attempt } from './actions';
import { getRuntime } from './runtime';

/** Loaded messages of `userId` per channel of the guild that the bulk-delete API accepts. */
export function purgeTargets(guildId: string, userId: string): Record<string, string[]> {
  const channels = useGuildStore.getState().channels;
  const timelines = useMessageStore.getState().timelines;
  const out: Record<string, string[]> = {};
  for (const [channelId, timeline] of Object.entries(timelines)) {
    if (channels[channelId]?.guild_id !== guildId) continue;
    const ids = purgeableMessageIds(
      timeline.ids.flatMap((id) => {
        const m = timeline.byId[id];
        return m ? [{ id, authorId: m.author.id, local: Boolean(m.localState) }] : [];
      }),
      userId,
    );
    if (ids.length) out[channelId] = ids;
  }
  return out;
}

/** Deletes the user's recent messages that are loaded in this guild, using the bulk-delete route. */
export async function purgeRecentMessages(guildId: string, userId: string): Promise<number> {
  const api = getRuntime().api;
  let deleted = 0;
  for (const [channelId, ids] of Object.entries(purgeTargets(guildId, userId))) {
    const plan = bulkDeletePlan(ids);
    const done = await attempt(async () => {
      for (const batch of plan.batches) await api.bulkDeleteMessages(channelId, batch);
      if (plan.single) await api.deleteMessage(channelId, plan.single);
      return true;
    }, 'Could not delete messages');
    if (!done) break;
    deleted += ids.length;
  }
  return deleted;
}

export function confirmPurgeRecentMessages(guildId: string, userId: string, name: string): void {
  const count = Object.values(purgeTargets(guildId, userId)).reduce((n, ids) => n + ids.length, 0);
  useUiStore.getState().openDialog({
    kind: 'confirm',
    title: `Delete recent messages from ${name}?`,
    body:
      count === 0
        ? 'No recent messages from them are loaded. Open the channels first, or ban them with message history deletion.'
        : `This removes ${count} loaded message${count === 1 ? '' : 's'} (newer than two weeks) from this server.`,
    confirmLabel: 'Delete messages',
    danger: true,
    onConfirm: async () => {
      if (count === 0) return;
      const removed = await purgeRecentMessages(guildId, userId);
      useUiStore.getState().toast({ tone: 'success', title: `Deleted ${removed} message${removed === 1 ? '' : 's'}` });
    },
  });
}
