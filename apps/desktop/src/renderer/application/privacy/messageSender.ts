/** Routes outgoing messages by effective delivery mode (P11) and owns the per-chat / account mode switches. */
import { ApiErrorCode, type Channel, type CreateMessageBody, type DeliveryMode } from '@shared/contracts/rest';
import type { ApiPort } from '../ports/api';
import { useGuildStore } from '../stores/guildStore';
import { useMessageStore, type ChatMessage } from '../stores/messageStore';
import { useSessionStore } from '../stores/sessionStore';
import { effectiveDeliveryMode, validateModeForChannel, validateModeForDevice } from '@renderer/domain/deliveryMode';
import type { EphemeralService } from './ephemeralService';
import type { LocalHistory } from './localHistory';
import type { P2PService } from './p2pService';
import { PrivateDeliveryError, generateLocalId, type SendInput } from './types';

export const HISTORY_PAGE_SIZE = 50;

export interface MessageSenderDeps {
  api: ApiPort;
  ephemeral: Pick<EphemeralService, 'send'>;
  p2p: Pick<P2PService, 'send'>;
  history: LocalHistory;
  now: () => number;
}

function isModeConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === ApiErrorCode.DELIVERY_MODE_CONFLICT;
}

export class MessageSender {
  constructor(private readonly deps: MessageSenderDeps) {}

  /** The mode a message in this channel would travel over right now. */
  resolveMode(channel: Channel): DeliveryMode {
    if (channel.delivery_mode) return channel.delivery_mode;
    const settings = useSessionStore.getState().settings;
    const participants = [
      { override: settings.delivery_overrides?.[channel.id] ?? null, accountDefault: settings.default_delivery_mode },
      ...(channel.recipients ?? []).map(() => ({ override: null, accountDefault: 'standard' as DeliveryMode })),
    ];
    return effectiveDeliveryMode({ guildId: channel.guild_id ?? null, channelMode: 'standard', participants });
  }

  async send(channel: Channel, input: SendInput): Promise<ChatMessage | null> {
    const mode = this.resolveMode(channel);
    if (mode === 'standard') return this.sendStandard(channel, input);
    return this.sendPrivate(channel, mode, input);
  }

  async edit(channel: Channel, messageId: string, content: string): Promise<void> {
    this.requireStandard(channel, 'edited');
    const updated = await this.deps.api.editMessage(channel.id, messageId, { content });
    useMessageStore.getState().patch(channel.id, messageId, updated);
  }

  async remove(channel: Channel, messageId: string): Promise<void> {
    this.requireStandard(channel, 'deleted');
    await this.deps.api.deleteMessage(channel.id, messageId);
    useMessageStore.getState().remove(channel.id, messageId);
  }

  /** Per-chat switch. `null` clears the override. Guild channels change the channel's own mode. */
  async setChannelMode(channel: Channel, mode: DeliveryMode | null): Promise<DeliveryMode> {
    const target = mode ?? 'standard';
    const reason = validateModeForChannel(target, this.scopeOf(channel));
    if (reason) throw new PrivateDeliveryError('invalid_mode', reason);
    const deviceReason = validateModeForDevice(target, Boolean(useSessionStore.getState().deviceId));
    if (deviceReason) throw new PrivateDeliveryError('encryption_unavailable', deviceReason);

    const guilds = useGuildStore.getState();
    if (channel.guild_id) {
      const updated = await this.deps.api.updateChannel(channel.id, { delivery_mode: target });
      guilds.upsertChannel(updated);
      return updated.delivery_mode;
    }
    await this.deps.api.setChannelDeliveryOverride(channel.id, mode);
    const overrides = { ...(useSessionStore.getState().settings.delivery_overrides ?? {}) };
    if (mode) overrides[channel.id] = mode;
    else delete overrides[channel.id];
    useSessionStore.getState().setSettings({ delivery_overrides: overrides });
    const refreshed = await this.deps.api.channel(channel.id);
    guilds.upsertChannel(refreshed);
    return refreshed.delivery_mode;
  }

  /** Account-wide default for new DMs. */
  async setDefaultMode(mode: DeliveryMode): Promise<void> {
    const settings = await this.deps.api.updateSettings({ default_delivery_mode: mode });
    useSessionStore.getState().setSettings(settings);
  }

  /** Account-wide: every call the user starts or joins is end-to-end encrypted (voice#8). */
  async setE2eeCallsDefault(enabled: boolean): Promise<void> {
    const settings = await this.deps.api.updateSettings({ e2ee_calls_default: enabled });
    useSessionStore.getState().setSettings(settings);
  }

  /** Server history for standard channels merged with the local encrypted store. */
  async loadHistory(channel: Channel, before?: string): Promise<void> {
    const mode = this.resolveMode(channel);
    const store = useMessageStore.getState();
    const prepend = before !== undefined;
    const beforeKey = before ? (store.timelines[channel.id]?.byId[before] ? Date.parse(store.timelines[channel.id]!.byId[before]!.timestamp) : null) : null;

    const local = await this.deps.history.list(channel.id, beforeKey, HISTORY_PAGE_SIZE);
    let remote: ChatMessage[] = [];
    if (mode === 'standard') {
      remote = await this.deps.api.messages(channel.id, { before, limit: HISTORY_PAGE_SIZE });
    }
    const merged = new Map<string, ChatMessage>();
    for (const message of [...local, ...remote]) merged.set(message.id, message);
    const hasMore = mode === 'standard' ? remote.length >= HISTORY_PAGE_SIZE : local.length >= HISTORY_PAGE_SIZE;
    store.setHistory(channel.id, [...merged.values()], { prepend, hasMoreBefore: hasMore });
  }

  // ---- internals --------------------------------------------------------------------

  private async sendPrivate(channel: Channel, mode: Exclude<DeliveryMode, 'standard'>, input: SendInput): Promise<ChatMessage> {
    const deviceReason = validateModeForDevice(mode, Boolean(useSessionStore.getState().deviceId));
    if (deviceReason) throw new PrivateDeliveryError('encryption_unavailable', deviceReason);
    return mode === 'ephemeral' ? this.deps.ephemeral.send(channel, input) : this.deps.p2p.send(channel, input);
  }

  private async sendStandard(channel: Channel, input: SendInput): Promise<ChatMessage | null> {
    const user = useSessionStore.getState().user;
    if (!user) throw new Error('Not signed in');
    const nonce = generateLocalId(this.deps.now());
    const messages = useMessageStore.getState();
    const optimistic: ChatMessage = {
      id: nonce,
      channel_id: channel.id,
      guild_id: channel.guild_id ?? null,
      author: user,
      content: input.content,
      timestamp: new Date(this.deps.now()).toISOString(),
      edited_timestamp: null,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: input.replyTo ? 19 : 0,
      nonce,
      message_reference: input.replyTo ? { message_id: input.replyTo, channel_id: channel.id, guild_id: channel.guild_id ?? undefined } : undefined,
      deliveryMode: 'standard',
    };
    messages.addOptimistic(optimistic);
    try {
      const body: CreateMessageBody = {
        content: input.content,
        nonce,
        message_reference: optimistic.message_reference,
        attachments: await this.uploadFiles(channel.id, input.files ?? []),
      };
      const sent = await this.deps.api.sendMessage(channel.id, body);
      useMessageStore.getState().receive({ ...sent, nonce });
      return sent;
    } catch (error) {
      if (isModeConflict(error)) return this.retryPrivately(channel, nonce, input);
      useMessageStore.getState().failOptimistic(channel.id, nonce, error instanceof Error ? error.message : 'Failed to send');
      throw error;
    }
  }

  /** The server says this channel is not standard (our cached mode was stale): re-resolve and take the private path. */
  private async retryPrivately(channel: Channel, nonce: string, input: SendInput): Promise<ChatMessage> {
    useMessageStore.getState().remove(channel.id, nonce);
    const fresh = await this.deps.api.channel(channel.id);
    useGuildStore.getState().upsertChannel(fresh);
    const mode = this.resolveMode(fresh);
    if (mode === 'standard') throw new PrivateDeliveryError('invalid_mode', 'The server rejected a standard message for this channel.');
    return this.sendPrivate(fresh, mode, input);
  }

  private async uploadFiles(channelId: string, files: File[]) {
    if (files.length === 0) return undefined;
    const { attachments: slots } = await this.deps.api.createAttachmentSlots(
      channelId,
      files.map((f) => ({ filename: f.name, file_size: f.size })),
    );
    await Promise.all(slots.map((slot, i) => this.deps.api.upload(slot.upload_url, files[i]!)));
    return slots.map((slot, i) => ({ id: slot.id, filename: files[i]!.name, uploaded_filename: slot.upload_filename }));
  }

  private requireStandard(channel: Channel, verb: string): void {
    if (this.resolveMode(channel) !== 'standard') {
      throw new PrivateDeliveryError('unsupported', `Messages in private chats cannot be ${verb} after sending.`);
    }
  }

  private scopeOf(channel: Channel): { isGuild: boolean; memberCount: number } {
    const guilds = useGuildStore.getState();
    if (channel.guild_id) {
      const guild = guilds.guilds[channel.guild_id];
      return { isGuild: true, memberCount: guild?.member_count ?? Object.keys(guilds.members[channel.guild_id] ?? {}).length };
    }
    return { isGuild: false, memberCount: (channel.recipients?.length ?? 0) + 1 };
  }
}
