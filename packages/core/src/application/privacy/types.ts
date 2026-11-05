/** Shared types and wire helpers for the private delivery modes (Ephemeral E2EE and P2P). */
import type { Channel, DeliveryMode, User } from '../../contracts/rest';
import { MAX_PRIVATE_FILES, parseFileRef, toAttachment, type PrivateFileRef, type PrivateMode } from '../../domain/privateAttachment';
import { decodeUtf8, encodeUtf8 } from '../../domain/utf8';
import { snowflakeFromTimestamp } from '../../domain/snowflake';
import type { ChatMessage } from '../stores/messageStore';

export interface SelfIdentity {
  userId: string;
  deviceId: string;
  identityKeyB64: string;
}

export interface SendInput {
  content: string;
  replyTo?: string | null;
  /** Private modes encrypt these on this device first; only ciphertext ever leaves it. */
  files?: File[];
  /** Per file, in the same order: alt text for standard chats. */
  fileOptions?: { description?: string }[];
  /** Text-to-speech message (`/tts`); standard chats only. */
  tts?: boolean;
  /** `@silent`: sent with SUPPRESS_NOTIFICATIONS (standard chats only). */
  silent?: boolean;
  /** False when the reply ping is toggled off (`allowed_mentions.replied_user = false`). */
  pingReplied?: boolean;
}

export interface PrivatePayload {
  v: 1;
  content: string;
  nonce: string;
  timestamp: string;
  reply_to?: string | null;
  /** Encrypted-file refs (key, nonce, hash, name, mime, size); only ever inside the encrypted envelope. */
  files?: PrivateFileRef[];
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
  let binary = '';
  for (const b of encodeUtf8(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function b64ToUtf8(b64: string): string {
  const binary = atob(b64);
  return decodeUtf8(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodePayload(payload: PrivatePayload): string {
  return utf8ToB64(JSON.stringify(payload));
}

/** `bind` validates attached file refs against the receiving channel, mode and the message id they must belong to. */
export function decodePayload(b64: string, bind?: { channelId: string; mode: PrivateMode; messageId: string }): PrivatePayload {
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
    files: bind ? validFiles(p.files, bind) : [],
  };
}

/** Keeps only well-formed refs that belong to this message; anything else a peer sent is dropped. */
export function validFiles(raw: unknown, bind: { channelId: string; mode: PrivateMode; messageId: string }): PrivateFileRef[] {
  if (!Array.isArray(raw)) return [];
  const refs: PrivateFileRef[] = [];
  for (const item of raw.slice(0, MAX_PRIVATE_FILES)) {
    const ref = parseFileRef(item, bind.channelId, bind.mode);
    if (ref && ref.id.startsWith(`${bind.messageId}:`) && !refs.some((r) => r.id === ref.id)) refs.push(ref);
  }
  return refs;
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
    attachments: (payload.files ?? []).map(toAttachment),
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
