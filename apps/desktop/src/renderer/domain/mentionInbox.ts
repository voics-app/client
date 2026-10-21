/** The Mentions inbox: recent @mentions of the viewer in servers, newest first. */
import { parseMarkdown, toPlainText } from './markdown';
import { isMentioned, type MentionContext, type PolicyMessage } from './notificationPolicy';
import { compareSnowflakes } from './snowflake';

export interface InboxEntry {
  id: string;
  channelId: string;
  guildId: string;
  authorId: string;
  authorName: string;
  /** Plain-text preview. */
  preview: string;
  timestamp: string;
}

export const INBOX_LIMIT = 100;

export interface InboxSource extends PolicyMessage {
  id: string;
  channel_id: string;
  guild_id?: string | null;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name?: string | null };
}

/** An inbox entry for a server message that mentions the viewer (not their own messages, not DMs), else null. */
export function inboxEntryOf(message: InboxSource, ctx: MentionContext): InboxEntry | null {
  if (!message.guild_id || message.author.id === ctx.meId || !isMentioned(message, ctx)) return null;
  return {
    id: message.id,
    channelId: message.channel_id,
    guildId: message.guild_id,
    authorId: message.author.id,
    authorName: message.author.global_name ?? message.author.username,
    preview: toPlainText(parseMarkdown(message.content)).slice(0, 200) || 'Sent an attachment',
    timestamp: message.timestamp,
  };
}

/** Adds an entry (deduplicated by message id), keeping the newest {@link INBOX_LIMIT}. */
export function addInboxEntry(list: readonly InboxEntry[], entry: InboxEntry, limit = INBOX_LIMIT): InboxEntry[] {
  if (list.some((e) => e.id === entry.id)) return list as InboxEntry[];
  return [...list, entry].sort((a, b) => compareSnowflakes(b.id, a.id)).slice(0, limit);
}

export function addInboxEntries(list: readonly InboxEntry[], entries: readonly InboxEntry[], limit = INBOX_LIMIT): InboxEntry[] {
  return entries.reduce<InboxEntry[]>((acc, e) => addInboxEntry(acc, e, limit), list as InboxEntry[]);
}

export function entriesByGuild(list: readonly InboxEntry[]): Map<string, InboxEntry[]> {
  const out = new Map<string, InboxEntry[]>();
  for (const e of list) out.set(e.guildId, [...(out.get(e.guildId) ?? []), e]);
  return out;
}

/** Drops entries that were deleted or are no longer visible (e.g. the viewer left the server). */
export function pruneInbox(list: readonly InboxEntry[], keep: (e: InboxEntry) => boolean): InboxEntry[] {
  const next = list.filter(keep);
  return next.length === list.length ? (list as InboxEntry[]) : next;
}
