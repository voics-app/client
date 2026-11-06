/**
 * What a device keeps of its private chats: deleting a message for everyone, tombstones for deletions that
 * arrive before the message does, and the disappearing-message timers. Shared by Ephemeral and P2P.
 */
import { parseTtl } from '../../domain/disappearing';
import { useGuildStore } from '../stores/guildStore';
import { useMessageStore } from '../stores/messageStore';
import { usePrivacyStore } from '../stores/privacyStore';
import type { LocalHistory } from './localHistory';

const TIMERS_KEY = 'disappear-timers';
const TOMBSTONE_LIMIT = 500;
const SCAN_LIMIT = 5000;

/** Message id to the user who deleted it. */
type Tombstones = Record<string, string>;

export type DeleteOutcome = 'deleted' | 'remembered' | 'refused';

export class PrivateRetention {
  constructor(
    private readonly history: LocalHistory,
    private readonly now: () => number,
  ) {}

  /** Loads the saved timers into the privacy store; call once the encrypted store is open. */
  async load(): Promise<void> {
    const saved = await this.history.getState<Record<string, unknown>>(TIMERS_KEY);
    const timers: Record<string, number> = {};
    for (const [channelId, value] of Object.entries(saved ?? {})) {
      const ttl = parseTtl(value);
      if (ttl) timers[channelId] = ttl;
    }
    usePrivacyStore.getState().loadTimers(timers);
  }

  ttlOf(channelId: string): number | undefined {
    return usePrivacyStore.getState().timers[channelId];
  }

  /** When a message arriving now with this peer-supplied timer should disappear. */
  expiryFor(ttlMs: number | undefined): number | undefined {
    return ttlMs ? this.now() + ttlMs : undefined;
  }

  async setTimer(channelId: string, ttlMs: number | null): Promise<void> {
    usePrivacyStore.getState().setTimer(channelId, ttlMs);
    await this.history.putState(TIMERS_KEY, usePrivacyStore.getState().timers);
  }

  /** Removes a message from the timeline and from the encrypted store. */
  async removeMessage(channelId: string, messageId: string): Promise<void> {
    useMessageStore.getState().remove(channelId, messageId);
    await this.history.remove(channelId, messageId);
  }

  /**
   * A delete-for-everyone control message. Only the author may delete: `senderUserId` is the authenticated
   * sender of the control message and must be the author of the target. A target this device does not have yet
   * is remembered, so the message is dropped if it still arrives.
   */
  async applyDelete(channelId: string, senderUserId: string, messageId: string): Promise<DeleteOutcome> {
    const known = useMessageStore.getState().timelines[channelId]?.byId[messageId] ?? (await this.findStored(channelId, messageId));
    if (known) {
      if (known.author.id !== senderUserId) return 'refused';
      await this.removeMessage(channelId, messageId);
      return 'deleted';
    }
    const key = `tombstones:${channelId}`;
    const tombstones = (await this.history.getState<Tombstones>(key)) ?? {};
    const entries = Object.entries({ ...tombstones, [messageId]: senderUserId }).slice(-TOMBSTONE_LIMIT);
    await this.history.putState(key, Object.fromEntries(entries));
    return 'remembered';
  }

  /** True when the author already deleted this message before it reached this device. */
  async wasDeleted(channelId: string, messageId: string, authorUserId: string): Promise<boolean> {
    const tombstones = await this.history.getState<Tombstones>(`tombstones:${channelId}`);
    return tombstones?.[messageId] === authorUserId;
  }

  /** Removes every message whose timer has run out, in open timelines and in the local store of every private chat. */
  async sweep(): Promise<void> {
    const now = this.now();
    for (const [channelId, timeline] of Object.entries(useMessageStore.getState().timelines)) {
      for (const message of Object.values(timeline.byId)) {
        if (message.expiresAt !== undefined && message.expiresAt <= now) await this.removeMessage(channelId, message.id);
      }
    }
    for (const channel of Object.values(useGuildStore.getState().channels)) {
      if (channel.delivery_mode && channel.delivery_mode !== 'standard') await this.history.list(channel.id, null, SCAN_LIMIT);
    }
  }

  private async findStored(channelId: string, messageId: string) {
    return (await this.history.list(channelId, null, SCAN_LIMIT)).find((m) => m.id === messageId);
  }
}
