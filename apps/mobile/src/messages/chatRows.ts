import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { groupMessages } from '@discordy/core/domain/messageGrouping';

export type ChatRow = { kind: 'message'; key: string; message: ChatMessage; showHeader: boolean } | { kind: 'new'; key: 'new' };

/** Replies (type 19) start a new group. */
const REPLY_TYPE = 19;

/**
 * The list rows for the message list, newest first (the list is inverted). The "New" divider goes above the first unread message,
 * which also starts a group so its author shows.
 */
export function buildRows(ordered: readonly ChatMessage[], firstUnreadId: string | null): ChatRow[] {
  const grouped = groupMessages(ordered.map((message) => ({ id: message.id, authorId: message.author.id, timestamp: Date.parse(message.timestamp), breaksGroup: message.type === REPLY_TYPE, message })));
  const rows: ChatRow[] = [];
  for (const g of grouped) {
    if (g.message.id === firstUnreadId) rows.push({ kind: 'new', key: 'new' });
    rows.push({ kind: 'message', key: g.message.id, message: g.message.message, showHeader: g.startsGroup || g.message.id === firstUnreadId });
  }
  return rows.reverse();
}

/** Whether the list is scrolled far enough from the newest message to offer "Jump to latest" (offset is from the bottom: the list is inverted). */
export function showJumpToLatest(offsetFromLatest: number, viewportHeight: number): boolean {
  return offsetFromLatest > viewportHeight * 1.5;
}
