/** Local private-message history in the encrypted local store (via the crypto bridge). */
import type { CryptoBridge } from '@shared/ipc';
import type { ChatMessage } from '../stores/messageStore';

export class LocalHistory {
  constructor(private readonly crypto: () => CryptoBridge | undefined) {}

  async save(message: ChatMessage): Promise<void> {
    const crypto = this.crypto();
    if (!crypto) return;
    await crypto.putMessage({
      channelId: message.channel_id,
      messageId: message.id,
      sortKey: Date.parse(message.timestamp) || 0,
      json: JSON.stringify({ ...message, localState: undefined }),
    });
  }

  /** Oldest first. `beforeSortKey` is a millisecond timestamp. */
  async list(channelId: string, beforeSortKey: number | null, limit: number): Promise<ChatMessage[]> {
    const crypto = this.crypto();
    if (!crypto) return [];
    try {
      const records = await crypto.listMessages(channelId, beforeSortKey, limit);
      return records
        .map((r) => JSON.parse(r.json) as ChatMessage)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    } catch {
      return [];
    }
  }

  async putState(key: string, value: unknown): Promise<void> {
    await this.crypto()?.putMessage({ channelId: `__state:${key}`, messageId: 'state', sortKey: 0, json: JSON.stringify(value) });
  }

  async getState<T>(key: string): Promise<T | null> {
    const crypto = this.crypto();
    if (!crypto) return null;
    try {
      const [record] = await crypto.listMessages(`__state:${key}`, null, 1);
      return record ? (JSON.parse(record.json) as T) : null;
    } catch {
      return null;
    }
  }
}
