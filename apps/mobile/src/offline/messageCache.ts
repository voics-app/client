import { deviceStorage, type KeyValueStorage } from '@discordy/core/application/ports/deviceStorage';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { compareSnowflakes } from '@discordy/core/domain/snowflake';

/** Messages kept per chat and chats kept, like Discord's cache of recent chats; the least recently saved chat goes first. */
export const CACHED_MESSAGES_PER_CHANNEL = 50;
export const CACHED_CHANNELS = 30;
const KEY = 'voics.messageCache.v1';

interface Entry {
  savedAt: number;
  messages: ChatMessage[];
}
type Cache = Record<string, Entry>;

/** The newest messages of a chat that were really sent: unsent and failed ones never go into the cache. */
export function recentMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => !m.localState)
    .sort((a, b) => compareSnowflakes(a.id, b.id))
    .slice(-CACHED_MESSAGES_PER_CHANNEL);
}

/** Drops the oldest saved chats beyond the limit. */
export function trimChannels(cache: Cache, max = CACHED_CHANNELS): Cache {
  const keys = Object.keys(cache);
  if (keys.length <= max) return cache;
  const keep = keys.sort((a, b) => cache[b]!.savedAt - cache[a]!.savedAt).slice(0, max);
  return Object.fromEntries(keep.map((k) => [k, cache[k]!]));
}

/**
 * The offline cache of recent messages of server-stored chats, in the device storage the app installed (a native key-value store; memory under test).
 * Only chats with standard delivery may be saved here: private chats promise that nothing is kept beyond their own storage. It is emptied on sign-out.
 */
export class MessageCache {
  constructor(private readonly storage: KeyValueStorage = deviceStorage) {}

  private read(): Cache {
    try {
      const raw = this.storage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Cache) : {};
    } catch {
      return {};
    }
  }

  load(channelId: string): ChatMessage[] {
    return this.read()[channelId]?.messages ?? [];
  }

  save(channelId: string, messages: readonly ChatMessage[], now: number = Date.now()): void {
    const recent = recentMessages(messages);
    if (recent.length === 0) return;
    try {
      this.storage.setItem(KEY, JSON.stringify(trimChannels({ ...this.read(), [channelId]: { savedAt: now, messages: recent } })));
    } catch {
      // A full or unavailable store only means this chat is not cached.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

/** The app's one cache. */
export const messageCache = new MessageCache();
