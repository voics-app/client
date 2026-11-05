/** Thread helpers shared by the clients: naming, which messages point at one, and the threads of a channel. */
import { ChannelType, type Channel } from '../contracts/rest';

export const THREAD_NAME_MAX = 100;
const SUGGESTED_NAME_LENGTH = 40;

export function isThread(channel: Pick<Channel, 'type'> | undefined): boolean {
  return channel?.type === ChannelType.PUBLIC_THREAD || channel?.type === ChannelType.PRIVATE_THREAD || channel?.type === ChannelType.ANNOUNCEMENT_THREAD;
}

/** The name suggested for a thread started from a message: its first line, cut to 40 characters, or "Thread" when it has no text. */
export function threadNameFor(content: string): string {
  const firstLine = content.split('\n', 1)[0] ?? '';
  return firstLine.slice(0, SUGGESTED_NAME_LENGTH).trim() || 'Thread';
}

/** The id of the thread a thread message (the starter's chip or the "started a thread" notice) points to. */
export function threadIdOf(message: { thread?: { id: string } | null; message_reference?: { channel_id?: string | null } | null }): string | undefined {
  return message.thread?.id ?? message.message_reference?.channel_id ?? undefined;
}

/** The threads under a channel that this client knows about, active ones first and newest first within each group. */
export function threadsOf(channels: Record<string, Channel>, parentId: string): Channel[] {
  const archived = (c: Channel) => (c.thread_metadata?.archived ? 1 : 0);
  return Object.values(channels)
    .filter((c) => isThread(c) && c.parent_id === parentId)
    .sort((a, b) => archived(a) - archived(b) || (BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0));
}

/** Why the composer is closed in a thread, or null when the viewer may write. Archived threads reopen on send, so only a lock blocks. */
export function threadBlockedReason(channel: Pick<Channel, 'thread_metadata'>, canManageThreads: boolean): string | null {
  return channel.thread_metadata?.locked && !canManageThreads ? 'This thread is locked.' : null;
}
