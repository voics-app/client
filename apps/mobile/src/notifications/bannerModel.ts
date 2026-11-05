import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import type { Channel } from '@discordy/core/contracts/rest';
import { alertBody } from '@discordy/core/domain/incomingAlert';

export interface Banner {
  /** The message id; a newer message replaces the banner. */
  id: string;
  guildId: string | null;
  channelId: string;
  title: string;
  body: string;
}

export const BANNER_MS = 4500;

const NOT_CHATS = new Set(['members', 'settings']);

/** The channel a route shows, or null on any other screen: `/servers/<guild>/<channel>` and `/dms/<channel>`. */
export function channelIdFromPath(pathname: string): string | null {
  const server = /^\/servers\/[^/]+\/([^/]+)\/?$/.exec(pathname);
  if (server) return NOT_CHATS.has(server[1]!) ? null : server[1]!;
  return /^\/dms\/([^/]+)\/?$/.exec(pathname)?.[1] ?? null;
}

/** What the banner for a message says: who, where, and the text (private messages never show it). */
export function bannerOf(message: ChatMessage, channel: Pick<Channel, 'name'> | undefined): Banner {
  const author = message.author.global_name || message.author.username;
  const guildId = message.guild_id ?? null;
  return {
    id: message.id,
    guildId,
    channelId: message.channel_id,
    title: guildId ? `${author} in #${channel?.name ?? 'channel'}` : channel?.name ? `${author} in ${channel.name}` : author,
    body: alertBody(message),
  };
}
