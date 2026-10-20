import { compareSnowflakes } from './snowflake';

export function isUnread(lastMessageId: string | null | undefined, lastReadId: string | null | undefined): boolean {
  if (!lastMessageId) return false;
  if (!lastReadId) return true;
  return compareSnowflakes(lastMessageId, lastReadId) > 0;
}

export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export interface ActivitySummary {
  /** Total unread mentions across all channels. */
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
