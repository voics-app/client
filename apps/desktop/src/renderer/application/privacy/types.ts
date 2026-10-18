/** Shared types and wire helpers for the private delivery modes (Ephemeral E2EE and P2P). */
import type { Attachment, Channel, DeliveryMode, User } from '@shared/contracts/rest';
import { snowflakeFromTimestamp } from '@renderer/domain/snowflake';
import type { ChatMessage } from '../stores/messageStore';

export interface SelfIdentity {
  userId: string;
  deviceId: string;
  identityKeyB64: string;
}

export interface SendInput {
  content: string;
  replyTo?: string | null;
  /** Standard mode only: private modes refuse attachments rather than uploading plaintext to a server. */
  files?: File[];
}

export interface PrivatePayload {
  v: 1;
  content: string;
  nonce: string;
  timestamp: string;
  reply_to?: string | null;
  attachments?: Attachment[];
}

export type PrivateDeliveryFailure =
  | 'encryption_unavailable'
  | 'peer_offline'
  | 'unverified_peer'
  | 'no_recipients'
  | 'unsupported'
  | 'invalid_mode';

export class PrivateDeliveryError extends Error {
  constructor(
    readonly reason: PrivateDeliveryFailure,
    message: string,
  ) {
    super(message);
    this.name = 'PrivateDeliveryError';
  }
}

export function utf8ToB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function b64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodePayload(payload: PrivatePayload): string {
  return utf8ToB64(JSON.stringify(payload));
}

export function decodePayload(b64: string): PrivatePayload {
  const parsed: unknown = JSON.parse(b64ToUtf8(b64));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('payload is not an object');
  const p = parsed as Partial<PrivatePayload>;
  if (p.v !== 1 || typeof p.content !== 'string' || typeof p.nonce !== 'string' || typeof p.timestamp !== 'string') {
    throw new Error('payload has an unsupported shape');
  }
  return {
    v: 1,
    content: p.content,
    nonce: p.nonce,
    timestamp: p.timestamp,
    reply_to: p.reply_to ?? null,
    attachments: p.attachments ?? [],
  };
}

let localSequence = 0;

/** Locally generated snowflake-shaped id: millisecond timestamp, 10 random worker bits, rolling sequence. */
export function generateLocalId(nowMs: number, random: () => number = Math.random): string {
  localSequence = (localSequence + 1) & 0xfff;
  const worker = BigInt(Math.floor(random() * 1024));
  return (BigInt(snowflakeFromTimestamp(nowMs)) | (worker << 12n) | BigInt(localSequence)).toString();
}

export interface BuildMessageInput {
  id: string;
  channel: Pick<Channel, 'id' | 'guild_id'>;
  author: User;
  payload: PrivatePayload;
  mode: Exclude<DeliveryMode, 'standard'>;
}

export function buildPrivateMessage(input: BuildMessageInput): ChatMessage {
  const { id, channel, author, payload, mode } = input;
  return {
    id,
    channel_id: channel.id,
    guild_id: channel.guild_id ?? null,
    author,
    content: payload.content,
    timestamp: payload.timestamp,
    edited_timestamp: null,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: payload.attachments ?? [],
    embeds: [],
    pinned: false,
    type: payload.reply_to ? 19 : 0,
    nonce: payload.nonce,
    message_reference: payload.reply_to ? { message_id: payload.reply_to, channel_id: channel.id } : undefined,
    deliveryMode: mode,
  };
}

export function encryptionUnavailable(reason?: string): PrivateDeliveryError {
  return new PrivateDeliveryError(
    'encryption_unavailable',
    `End-to-end encryption is unavailable on this device${reason ? `: ${reason}` : ''}. Message not sent.`,
  );
}
