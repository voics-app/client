/** Commands that reorder channels and categories: optimistic update, bulk PATCH, revert on failure (client#59). */
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { guildChannels, sendChannelMoves } from '@discordy/core/application/channelOrderCommands';
import { diffMoves, layoutOf, newParentOf, overwritesDiffer, stepCategory, stepChannel, type ChannelLayout, type ChannelMove } from '@discordy/core/domain/channelOrder';
import type { Channel } from '@discordy/core/contracts/rest';
import { attempt } from './actions';
import { getRuntime } from './runtime';

export { guildChannels };

async function send(guildId: string, moves: ChannelMove[], extra?: (move: ChannelMove) => Partial<Channel>): Promise<boolean> {
  const ok = await attempt(() => sendChannelMoves(getRuntime().api, guildId, moves, extra).then(() => true), 'Could not reorder channels');
  return Boolean(ok);
}

/** Applies a new layout. Moving a channel into a category whose permissions differ afterwards offers to sync them. */
export async function applyChannelLayout(guildId: string, layout: ChannelLayout, movedChannelId?: string): Promise<void> {
  const channels = guildChannels(guildId);
  const moves = diffMoves(channels, layout);
  if (moves.length === 0) return;
  const parentId = movedChannelId ? newParentOf(channels, layout, movedChannelId) : null;
  const ok = await send(guildId, moves);
  if (!ok || !movedChannelId || !parentId) return;
  const store = useGuildStore.getState().channels;
  const channel = store[movedChannelId];
  const category = store[parentId];
  if (channel && category && overwritesDiffer(channel.permission_overwrites, category.permission_overwrites)) promptPermissionSync(guildId, channel, category);
}

function promptPermissionSync(guildId: string, channel: Channel, category: Channel): void {
  useUiStore.getState().openDialog({
    kind: 'confirm',
    title: `Sync permissions with ${category.name ?? 'the category'}?`,
    body: `#${channel.name} has permissions that differ from its new category. Syncing replaces them with the category's. Cancel keeps the channel's own permissions.`,
    confirmLabel: 'Sync permissions',
    onConfirm: async () => {
      const current = useGuildStore.getState().channels[channel.id];
      if (!current) return;
      const move: ChannelMove = { id: channel.id, position: current.position ?? 0, parent_id: category.id, lock_permissions: true };
      await send(guildId, [move], () => ({ permission_overwrites: category.permission_overwrites }));
    },
  });
}

export function moveChannelStep(guildId: string, channelId: string, direction: -1 | 1): Promise<void> {
  return applyChannelLayout(guildId, stepChannel(layoutOf(guildChannels(guildId)), channelId, direction), channelId);
}

export function moveCategoryStep(guildId: string, categoryId: string, direction: -1 | 1): Promise<void> {
  return applyChannelLayout(guildId, stepCategory(layoutOf(guildChannels(guildId)), categoryId, direction));
}

/** Whether a step in this direction would change anything (to disable the menu entry at the edges). */
export function canStep(guildId: string, id: string, kind: 'channel' | 'category', direction: -1 | 1): boolean {
  const layout = layoutOf(guildChannels(guildId));
  return (kind === 'channel' ? stepChannel(layout, id, direction) : stepCategory(layout, id, direction)) !== layout;
}
