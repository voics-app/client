import type { Channel } from '../contracts/rest';
import { compareSnowflakes } from './snowflake';
import { isPrivateConversation } from './dmModel';
import { isUnread } from './unread';

export interface UnreadDm {
  channel: Channel;
  /** Unread messages, at least 1. */
  count: number;
}

type ReadPositions = Record<string, { lastReadId: string | null; mentionCount: number } | undefined>;

/** The most conversations the server rail lists above the servers. */
export const MAX_RAIL_DMS = 8;

/** Conversations with unread messages, newest first: the avatars at the top of the server rail. Muted ones stay out, and so do chats never opened and with nothing counted. */
export function unreadDms(channels: Record<string, Channel>, reads: ReadPositions, isMuted: (channel: Channel) => boolean, limit = MAX_RAIL_DMS): UnreadDm[] {
  return Object.values(channels)
    .filter((channel) => isPrivateConversation(channel) && !isMuted(channel))
    .flatMap((channel) => {
      const read = reads[channel.id];
      const count = read?.mentionCount ?? 0;
      const behind = Boolean(read?.lastReadId) && isUnread(channel.last_message_id, read?.lastReadId);
      return count > 0 || behind ? [{ channel, count: Math.max(count, 1) }] : [];
    })
    .sort((a, b) => compareSnowflakes(b.channel.last_message_id ?? b.channel.id, a.channel.last_message_id ?? a.channel.id))
    .slice(0, limit);
}
