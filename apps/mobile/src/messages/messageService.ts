/** Message use cases for the mobile channel screen: history paging, sending with retry, edit, delete and reactions. */
import type { ApiPort } from '@discordy/core/application/ports/api';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useUploadStore } from '@discordy/core/application/stores/uploadStore';
import { reactionKey, useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { idBefore } from '@discordy/core/domain/unread';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { Channel, CreateMessageBody } from '@discordy/core/contracts/rest';
import { parseApiEmoji } from '@discordy/core/domain/quickReactions';
import { compareSnowflakes, snowflakeFromTimestamp } from '@discordy/core/domain/snowflake';
import { UploadCancelled, type OutgoingFile } from './outgoingFile';

export const PAGE_SIZE = 50;

export type MessageApi = Pick<ApiPort, 'messages' | 'ack' | 'sendMessage' | 'editMessage' | 'deleteMessage' | 'addReaction' | 'removeReaction' | 'createAttachmentSlots' | 'upload' | 'pin' | 'unpin'>;

export interface SendInput {
  content: string;
  replyTo?: string;
  files?: OutgoingFile[];
}

/** Reads a picked file into a Blob; React Native's fetch serves file URIs. */
export type ReadBlob = (file: OutgoingFile) => Promise<Blob>;

const readFromDevice: ReadBlob = async (file) => {
  const blob = await (await fetch(file.uri)).blob();
  return blob.type ? blob : blob.slice(0, blob.size, file.mimeType);
};

export class MessageService {
  private readonly paging = new Set<string>();
  private sequence = 0;
  /** What each unsent or failed message was meant to carry, so Retry sends the same files again. */
  private readonly unsent = new Map<string, SendInput>();

  constructor(
    private readonly api: MessageApi,
    private readonly now: () => number = Date.now,
    private readonly readBlob: ReadBlob = readFromDevice,
  ) {}

  async loadLatest(channelId: string): Promise<void> {
    const page = await this.api.messages(channelId, { limit: PAGE_SIZE });
    useMessageStore.getState().setHistory(channelId, page, { prepend: false, hasMoreBefore: page.length >= PAGE_SIZE });
  }

  /** The window of messages around one message (a pin, search hit, link or inbox entry). The window is detached from the present until it reaches the channel's latest message. */
  async loadAround(channel: Channel, messageId: string): Promise<void> {
    const page = await this.api.messages(channel.id, { around: messageId, limit: PAGE_SIZE });
    if (page.length === 0) return;
    const newest = page.reduce((max, m) => (compareSnowflakes(m.id, max) > 0 ? m.id : max), page[0]!.id);
    const last = channel.last_message_id;
    useMessageStore.getState().setHistory(channel.id, page, { prepend: false, hasMoreBefore: true, hasMoreAfter: !last || compareSnowflakes(newest, last) < 0 });
  }

  /** Extends a detached window towards the present. One request per channel at a time. */
  async loadNewer(channelId: string): Promise<void> {
    const timeline = useMessageStore.getState().timelines[channelId];
    if (!timeline?.hasMoreAfter || this.paging.has(channelId)) return;
    const newest = timeline.ids.findLast((id) => !timeline.byId[id]?.localState);
    if (!newest) return;
    this.paging.add(channelId);
    try {
      const page = await this.api.messages(channelId, { after: newest, limit: PAGE_SIZE });
      useMessageStore.getState().setHistory(channelId, page, { prepend: false, append: true, hasMoreBefore: true, hasMoreAfter: page.length >= PAGE_SIZE });
    } finally {
      this.paging.delete(channelId);
    }
  }

  /** Tells the server (and this device's unread dots) that the channel is read up to the given message, as desktop does when a channel is open at its latest message. */
  markRead(channelId: string, messageId: string): void {
    const read = useReadStateStore.getState().byChannel[channelId];
    if (read?.lastReadId && compareSnowflakes(read.lastReadId, messageId) >= 0 && read.mentionCount === 0) return;
    useReadStateStore.getState().markRead(channelId, messageId);
    void this.api.ack(channelId, messageId).catch(() => undefined);
  }

  /** Pins or unpins a message, showing the change at once and undoing it if the server refuses. */
  async setPinned(channelId: string, messageId: string, pinned: boolean): Promise<void> {
    useMessageStore.getState().patch(channelId, messageId, { pinned });
    await (pinned ? this.api.pin(channelId, messageId) : this.api.unpin(channelId, messageId)).catch((error: unknown) => {
      useMessageStore.getState().patch(channelId, messageId, { pinned: !pinned });
      throw error;
    });
  }

  /** Moves the read marker to just before this message, so it and everything after it count as unread again (the chat shows its New divider). */
  markUnread(channelId: string, messageId: string): void {
    const marker = idBefore(messageId);
    useReadStateStore.getState().setPosition(channelId, marker, 0);
    useReadNavStore.getState().setAnchor(channelId, marker);
    void this.api.ack(channelId, marker, { manual: true, mentionCount: 0 }).catch(() => undefined);
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

  /** Never throws: a failed send stays in the timeline, marked failed with the reason, for Retry or Discard. Resolves true when the server took the message. */
  async send(channel: Channel, input: SendInput): Promise<boolean> {
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
      attachments: (input.files ?? []).map((f, i) => ({ id: `local-${i}`, filename: f.name, content_type: f.mimeType, size: f.size, url: f.uri })),
      embeds: [],
      pinned: false,
      type: reference ? 19 : 0,
      nonce,
      message_reference: reference,
      deliveryMode: 'standard',
    });
    this.unsent.set(nonce, input);
    try {
      const attachments = await this.uploadFiles(channel.id, nonce, input.files ?? []);
      const body: CreateMessageBody = { content: input.content, nonce, ...(reference ? { message_reference: reference } : {}), ...(attachments ? { attachments } : {}) };
      const sent = await this.api.sendMessage(channel.id, body);
      this.unsent.delete(nonce);
      useMessageStore.getState().receive({ ...sent, nonce });
      return true;
    } catch (error) {
      if (error instanceof UploadCancelled) {
        this.discard(channel.id, nonce);
        return false;
      }
      useMessageStore.getState().failOptimistic(channel.id, nonce, errorMessage(error));
      return false;
    }
  }

  async retry(channel: Channel, nonce: string): Promise<boolean> {
    const failed = useMessageStore.getState().timelines[channel.id]?.byId[nonce];
    if (failed?.localState !== 'failed') return false;
    const input = this.unsent.get(nonce);
    this.discard(channel.id, nonce);
    return this.send(channel, input ?? { content: failed.content, ...(failed.message_reference?.message_id ? { replyTo: failed.message_reference.message_id } : {}) });
  }

  discard(channelId: string, nonce: string): void {
    this.unsent.delete(nonce);
    useMessageStore.getState().remove(channelId, nonce);
  }

  /** Uploads the files through the presigned-upload flow, reporting progress in the upload store so the message can show a bar and a Cancel. */
  private async uploadFiles(channelId: string, nonce: string, files: OutgoingFile[]): Promise<CreateMessageBody['attachments']> {
    if (files.length === 0) return undefined;
    const controller = new AbortController();
    useUploadStore.getState().begin(nonce, files.reduce((sum, f) => sum + f.size, 0), () => controller.abort());
    try {
      const { attachments: slots } = await this.api.createAttachmentSlots(channelId, files.map((f) => ({ filename: f.name, file_size: f.size })));
      if (slots.length !== files.length) throw new Error('The server returned the wrong number of upload slots.');
      const loaded = files.map(() => 0);
      await Promise.all(
        slots.map(async (slot, i) => {
          const blob = await this.readBlob(files[i]!);
          await this.api.upload(
            slot.upload_url,
            blob,
            (done) => {
              loaded[i] = done;
              useUploadStore.getState().progress(nonce, loaded.reduce((sum, n) => sum + n, 0));
            },
            controller.signal,
          );
        }),
      );
      return slots.map((slot, i) => ({ id: slot.id, filename: files[i]!.name, uploaded_filename: slot.upload_filename }));
    } catch (error) {
      if (controller.signal.aborted) throw new UploadCancelled();
      throw error;
    } finally {
      useUploadStore.getState().end(nonce);
    }
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
