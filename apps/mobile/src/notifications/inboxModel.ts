import type { Channel, GuildFull } from '@discordy/core/contracts/rest';
import { entriesByGuild, type InboxEntry } from '@discordy/core/domain/mentionInbox';
import { formatMessageTime } from '@discordy/core/domain/messageTime';

export interface InboxRow {
  id: string;
  guildId: string;
  channelId: string;
  author: string;
  channelName: string;
  preview: string;
  time: string;
}

export interface InboxSection {
  guildId: string;
  title: string;
  data: InboxRow[];
}

/** The mentions inbox as one section per server, newest first, leaving out servers and channels the viewer no longer has. */
export function inboxSections(entries: readonly InboxEntry[], guilds: Record<string, Pick<GuildFull, 'name'>>, channels: Record<string, Pick<Channel, 'name'>>, now: number): InboxSection[] {
  const visible = entries.filter((e) => guilds[e.guildId] && channels[e.channelId]);
  return [...entriesByGuild(visible)].map(([guildId, list]) => ({
    guildId,
    title: guilds[guildId]!.name,
    data: list.map((e) => ({
      id: e.id,
      guildId,
      channelId: e.channelId,
      author: e.authorName,
      channelName: channels[e.channelId]!.name ?? 'channel',
      preview: e.preview,
      time: formatMessageTime(e.timestamp, now),
    })),
  }));
}
