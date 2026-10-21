import { compareSnowflakes, timestampOf } from './snowflake';

export function isUnread(lastMessageId: string | null | undefined, lastReadId: string | null | undefined): boolean {
  if (!lastMessageId) return false;
  if (!lastReadId) return true;
  return compareSnowflakes(lastMessageId, lastReadId) > 0;
}

export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export interface ActivitySummary {
  /** Total unread mentions across all channels (mentions still count in muted ones, as in Discord). */
  mentions: number;
  /** Number of unmuted channels with unread messages. */
  unread: number;
}

/** Aggregates read state into the counts the OS surfaces (badge, tray, title) show. */
export function summarizeActivity(
  channels: readonly { id: string; last_message_id?: string | null }[],
  reads: Readonly<Record<string, { lastReadId: string | null; mentionCount: number } | undefined>>,
  muted: Readonly<Record<string, boolean>>,
): ActivitySummary {
  let mentions = 0;
  let unread = 0;
  for (const c of channels) {
    const r = reads[c.id];
    mentions += r?.mentionCount ?? 0;
    if (!muted[c.id] && isUnread(c.last_message_id, r?.lastReadId)) unread += 1;
  }
  return { mentions, unread };
}

/** The id just before `messageId`: acking it leaves that message (and everything after) unread. */
export function idBefore(messageId: string): string {
  const n = BigInt(messageId);
  return (n > 0n ? n - 1n : 0n).toString();
}

export interface MarkerMessage {
  id: string;
  authorId: string;
}

/** First message after the read marker that somebody else wrote; the "New" divider goes above it. */
export function firstUnreadMessageId(messages: readonly MarkerMessage[], marker: string | null | undefined, me: string | undefined): string | null {
  if (!marker) return null;
  for (const m of messages) {
    if (compareSnowflakes(m.id, marker) > 0 && m.authorId !== me) return m.id;
  }
  return null;
}

export interface UnreadBarModel {
  /** Messages after the marker that are currently loaded (others' only). */
  count: number;
  /** True when older unread messages may exist beyond what is loaded. */
  more: boolean;
  /** When the marker message was posted; the bar reads "since ...". */
  sinceMs: number | null;
}

/** Summarises the unread backlog for the bar at the top of the chat. */
export function unreadBar(
  messages: readonly MarkerMessage[],
  marker: string | null | undefined,
  me: string | undefined,
  hasMoreBefore: boolean,
): UnreadBarModel | null {
  if (!marker) return null;
  const count = messages.filter((m) => compareSnowflakes(m.id, marker) > 0 && m.authorId !== me).length;
  const oldestLoaded = messages[0]?.id;
  const more = hasMoreBefore && (!oldestLoaded || compareSnowflakes(oldestLoaded, marker) > 0);
  return { count, more, sinceMs: timestampOf(marker) };
}
