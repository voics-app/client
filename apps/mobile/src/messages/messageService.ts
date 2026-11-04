/** Message use cases for the mobile channel screen: history paging, sending with retry, edit, delete and reactions. */
import type { ApiPort } from '@discordy/core/application/ports/api';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { reactionKey, useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { Channel, CreateMessageBody } from '@discordy/core/contracts/rest';
import { parseApiEmoji } from '@discordy/core/domain/quickReactions';
import { snowflakeFromTimestamp } from '@discordy/core/domain/snowflake';

export const PAGE_SIZE = 50;

export type MessageApi = Pick<ApiPort, 'messages' | 'sendMessage' | 'editMessage' | 'deleteMessage' | 'addReaction' | 'removeReaction'>;

export interface SendInput {
  content: string;
  replyTo?: string;
}

export class MessageService {
  private readonly paging = new Set<string>();
  private sequence = 0;

  constructor(
    private readonly api: MessageApi,
    private readonly now: () => number = Date.now,
  ) {}

  async loadLatest(channelId: string): Promise<void> {
    const page = await this.api.messages(channelId, { limit: PAGE_SIZE });
    useMessageStore.getState().setHistory(channelId, page, { prepend: false, hasMoreBefore: page.length >= PAGE_SIZE });
  }

  /** Older history, from the oldest message the server has given us. One request per channel at a time. */
  async loadOlder(channelId: string): Promise<void> {
    const timeline = useMessageStore.getState().timelines[channelId];
    if (!timeline?.loaded || !timeline.hasMoreBefore || this.paging.has(channelId)) return;
    const oldest = timeline.ids.find((id) => !timeline.byId[id]?.localState);
    if (!oldest) return;
    this.paging.add(channelId);
    try {
      const page = await this.api.messages(channelId, { before: oldest, limit: PAGE_SIZE });
      useMessageStore.getState().setHistory(channelId, page, { prepend: true, hasMoreBefore: page.length >= PAGE_SIZE });
    } finally {
      this.paging.delete(channelId);
    }
  }

  /** Never throws: a failed send stays in the timeline, marked failed with the reason, for Retry or Discard. */
  async send(channel: Channel, input: SendInput): Promise<void> {
    const user = useSessionStore.getState().user;
    if (!user) throw new Error('Not signed in');
    const nonce = this.nonce();
    const reference = input.replyTo ? { message_id: input.replyTo, channel_id: channel.id, guild_id: channel.guild_id ?? undefined } : undefined;
    const store = useMessageStore.getState();
    store.addOptimistic({
      id: nonce,
      channel_id: channel.id,
      guild_id: channel.guild_id ?? null,
      author: user,
      content: input.content,
      timestamp: new Date(this.now()).toISOString(),
      edited_timestamp: null,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: reference ? 19 : 0,
      nonce,
      message_reference: reference,
      deliveryMode: 'standard',
    });
    try {
      const body: CreateMessageBody = { content: input.content, nonce, ...(reference ? { message_reference: reference } : {}) };
      const sent = await this.api.sendMessage(channel.id, body);
      useMessageStore.getState().receive({ ...sent, nonce });
    } catch (error) {
      useMessageStore.getState().failOptimistic(channel.id, nonce, errorMessage(error));
    }
  }

  async retry(channel: Channel, nonce: string): Promise<void> {
    const failed = useMessageStore.getState().timelines[channel.id]?.byId[nonce];
    if (failed?.localState !== 'failed') return;
    this.discard(channel.id, nonce);
    await this.send(channel, { content: failed.content, ...(failed.message_reference?.message_id ? { replyTo: failed.message_reference.message_id } : {}) });
  }

  discard(channelId: string, nonce: string): void {
    useMessageStore.getState().remove(channelId, nonce);
  }

  async edit(channelId: string, messageId: string, content: string): Promise<void> {
    const updated = await this.api.editMessage(channelId, messageId, { content });
    useMessageStore.getState().patch(channelId, messageId, updated);
  }

  async remove(channelId: string, messageId: string): Promise<void> {
    await this.api.deleteMessage(channelId, messageId);
    useMessageStore.getState().remove(channelId, messageId);
  }

  /** Adds or removes the user's own reaction, showing the change at once and undoing it if the server refuses. */
  async toggleReaction(channelId: string, messageId: string, apiEmoji: string): Promise<void> {
    const emoji = parseApiEmoji(apiEmoji);
    const message: ChatMessage | undefined = useMessageStore.getState().timelines[channelId]?.byId[messageId];
    const key = reactionKey(emoji);
    const mine = message?.reactions?.some((r) => reactionKey(r.emoji) === key && r.me) ?? false;
    const store = useMessageStore.getState();
    if (mine) {
      store.reactionRemove(channelId, messageId, emoji, true);
      await this.api.removeReaction(channelId, messageId, apiEmoji).catch((error: unknown) => {
        useMessageStore.getState().reactionAdd(channelId, messageId, emoji, true);
        throw error;
      });
    } else {
      store.reactionAdd(channelId, messageId, emoji, true);
      await this.api.addReaction(channelId, messageId, apiEmoji).catch((error: unknown) => {
        useMessageStore.getState().reactionRemove(channelId, messageId, emoji, true);
        throw error;
      });
    }
  }

  private nonce(): string {
    this.sequence = (this.sequence + 1) & 0xfff;
    const worker = BigInt(Math.floor(Math.random() * 1024));
    return (BigInt(snowflakeFromTimestamp(this.now())) | (worker << 12n) | BigInt(this.sequence)).toString();
  }
}
