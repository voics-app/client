import type { Channel, GuildNotificationSettings } from '@discordy/core/contracts/rest';
import { ChannelType } from '@discordy/core/contracts/rest';
import { isChannelMutedDeep } from '@discordy/core/domain/notificationSettings';
import { isUnread } from '@discordy/core/domain/unread';

export type ReadStates = Record<string, { lastReadId: string | null; mentionCount: number } | undefined>;

export interface Activity {
  unread: boolean;
  mentions: number;
}

/** Unread and mention totals over a set of servers, as the desktop rail's pip and badge show them (muted channels never light the pip). */
export function guildActivity(
  channels: Record<string, Channel>,
  reads: ReadStates,
  settingsFor: (guildId: string) => GuildNotificationSettings | undefined,
  guildIds: ReadonlySet<string>,
  now: number,
): Activity {
  let unread = false;
  let mentions = 0;
  for (const c of Object.values(channels)) {
    if (!c.guild_id || !guildIds.has(c.guild_id) || c.type !== ChannelType.GUILD_TEXT) continue;
    const read = reads[c.id];
    mentions += read?.mentionCount ?? 0;
    if (!isChannelMutedDeep(settingsFor(c.guild_id), c, now) && isUnread(c.last_message_id, read?.lastReadId)) unread = true;
  }
  return { unread, mentions };
}

/** Mentions across all direct and group conversations: the badge on the rail's DM button. */
export function dmMentionTotal(channels: Record<string, Channel>, reads: ReadStates): number {
  return Object.values(channels).reduce((sum, c) => (c.guild_id ? sum : sum + (reads[c.id]?.mentionCount ?? 0)), 0);
}

export interface ChannelFlags {
  unread: boolean;
  muted: boolean;
  mentions: number;
}

/** A channel row's indicators: bold name and dot when unread, dimmed when muted, count when mentioned. */
export function channelFlags(
  channel: Channel,
  read: ReadStates[string],
  settings: GuildNotificationSettings | undefined,
  now: number,
): ChannelFlags {
  const muted = isChannelMutedDeep(settings, channel, now);
  return { unread: !muted && isUnread(channel.last_message_id, read?.lastReadId), muted, mentions: read?.mentionCount ?? 0 };
}

/** One or two letters for a server without an icon (desktop's initialsOf). */
export function initialsOf(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  return (parts.length > 1 ? first[0]! + parts[parts.length - 1]![0]! : first.slice(0, 2)).toUpperCase();
}
