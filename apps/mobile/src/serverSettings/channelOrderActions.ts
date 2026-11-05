import { Alert } from 'react-native';
import { guildChannels, sendChannelMoves } from '@discordy/core/application/channelOrderCommands';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { Channel } from '@discordy/core/contracts/rest';
import { diffMoves, layoutOf, newParentOf, overwritesDiffer, stepCategory, stepChannel, type ChannelLayout, type ChannelMove } from '@discordy/core/domain/channelOrder';
import { getRuntime } from '../runtime';
import { attempt } from '../ui/attempt';

const send = (guildId: string, moves: ChannelMove[], extra?: (move: ChannelMove) => Partial<Channel>) =>
  attempt(() => sendChannelMoves(getRuntime().api, guildId, moves, extra).then(() => true), 'Could not reorder channels');

/** Moving a channel into a category whose permissions differ afterwards offers to sync them; Keep leaves the channel with its own. */
function promptPermissionSync(guildId: string, channel: Channel, category: Channel): void {
  Alert.alert(`Sync permissions with ${category.name ?? 'the category'}?`, `#${channel.name} has permissions that differ from its new category. Syncing replaces them with the category's.`, [
    { text: 'Keep', style: 'cancel' },
    {
      text: 'Sync permissions',
      onPress: () => {
        const current = useGuildStore.getState().channels[channel.id];
        if (!current) return;
        void send(guildId, [{ id: channel.id, position: current.position ?? 0, parent_id: category.id, lock_permissions: true }], () => ({ permission_overwrites: category.permission_overwrites }));
      },
    },
  ]);
}

async function applyLayout(guildId: string, layout: ChannelLayout, movedChannelId?: string): Promise<void> {
  const channels = guildChannels(guildId);
  const moves = diffMoves(channels, layout);
  if (moves.length === 0) return;
  const parentId = movedChannelId ? newParentOf(channels, layout, movedChannelId) : null;
  if (!(await send(guildId, moves)) || !movedChannelId || !parentId) return;
  const store = useGuildStore.getState().channels;
  const channel = store[movedChannelId];
  const category = store[parentId];
  if (channel && category && overwritesDiffer(channel.permission_overwrites, category.permission_overwrites)) promptPermissionSync(guildId, channel, category);
}

/** Moves a channel one place up (-1) or down (1) in the sidebar order, across the edge of its category into the next one. */
export const moveChannelStep = (guildId: string, channelId: string, direction: -1 | 1) => applyLayout(guildId, stepChannel(layoutOf(guildChannels(guildId)), channelId, direction), channelId);

export const moveCategoryStep = (guildId: string, categoryId: string, direction: -1 | 1) => applyLayout(guildId, stepCategory(layoutOf(guildChannels(guildId)), categoryId, direction));

/** Whether a step in this direction would change anything, so the button can be disabled at the edges. */
export function canStep(guildId: string, id: string, kind: 'channel' | 'category', direction: -1 | 1): boolean {
  const layout = layoutOf(guildChannels(guildId));
  return (kind === 'channel' ? stepChannel(layout, id, direction) : stepCategory(layout, id, direction)) !== layout;
}
