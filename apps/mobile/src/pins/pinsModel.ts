import type { Channel } from '@discordy/core/contracts/rest';
import type { ChannelAccess } from '../messages/messageAccess';

/** Unpinning needs Manage Messages in a server; in a DM any participant may unpin (core's `canUnpin` rule, from the access already computed for the chat). */
export function mayUnpin(channel: Pick<Channel, 'guild_id'>, access: Pick<ChannelAccess, 'canManageMessages'>): boolean {
  return !channel.guild_id || access.canManageMessages;
}
