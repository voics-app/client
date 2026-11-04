/**
 * Media frame protection primitives shared by the E2EE worker and its tests.
 * Per-sender keys are derived (HKDF-SHA256) from a base key that the main
 * thread builds out of an MLS exporter secret, one base key per epoch.
 */
import { buildIv, packFrame, unencryptedPrefixLength, unpackFrame } from '@discordy/core/domain/frameFormat';

export const KEY_INFO_PREFIX = 'discordy-frame-key-v1';
const TAG_BITS = 128;

export interface SenderKey {
  key: CryptoKey;
  salt: Uint8Array;
}

export type MediaKind = 'audio' | 'video';

export function importEpochBase(secret: Uint8Array, subtle: SubtleCrypto = crypto.subtle): Promise<CryptoKey> {
  return subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveBits']);
}

export async function deriveSenderKey(
  base: CryptoKey,
  userId: string,
  generation: number,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<SenderKey> {
  const info = new TextEncoder().encode(`${KEY_INFO_PREFIX}|${userId}|${generation & 0xff}`);
  const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info }, base, (16 + 12) * 8);
  const bytes = new Uint8Array(bits);
  const key = await subtle.importKey('raw', bytes.slice(0, 16), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { key, salt: bytes.slice(16, 28) };
}

export async function encryptFrame(
  sender: SenderKey,
  counter: number,
  generation: number,
  kind: MediaKind,
  codec: string,
  data: Uint8Array,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<Uint8Array> {
  const prefix = unencryptedPrefixLength(kind, codec, data);
  const header = data.slice(0, prefix);
  const iv = buildIv(counter, sender.salt);
  const sealed = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: header as BufferSource, tagLength: TAG_BITS },
    sender.key,
    data.slice(prefix) as BufferSource,
  );
  return packFrame({ header, ciphertext: new Uint8Array(sealed), counter, generation });
}

/** Returns the key generation stamped on a frame, or null when the frame carries no protection trailer. */
export function readGeneration(data: Uint8Array, kind: MediaKind, codec: string): number | null {
  const frame = unpackFrame(data, unencryptedPrefixLength(kind, codec, data));
  return frame ? frame.generation : null;
}

/** Returns null for unprotected frames. Throws when authentication fails. */
export async function decryptFrame(
  sender: SenderKey,
  kind: MediaKind,
  codec: string,
  data: Uint8Array,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<Uint8Array | null> {
  const frame = unpackFrame(data, unencryptedPrefixLength(kind, codec, data));
  if (!frame) return null;
  const iv = buildIv(frame.counter, sender.salt);
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: frame.header as BufferSource, tagLength: TAG_BITS },
    sender.key,
    frame.ciphertext as BufferSource,
  );
  const out = new Uint8Array(frame.header.length + plain.byteLength);
  out.set(frame.header, 0);
  out.set(new Uint8Array(plain), frame.header.length);
  return out;
}

/** Holds per-epoch base keys and lazily derived per-sender keys. */
export class FrameKeyring {
  private readonly bases = new Map<number, CryptoKey>();
  private readonly senders = new Map<string, Promise<SenderKey>>();
  /** Generation used for outgoing frames; null until activated, which keeps the sender silent. */
  sendGeneration: number | null = null;
  /** During MLS transitions unprotected frames from peers are still accepted. */
  passthrough = false;

  constructor(private readonly subtle: SubtleCrypto = crypto.subtle) {}

  setEpoch(generation: number, base: CryptoKey): void {
    const g = generation & 0xff;
    this.bases.set(g, base);
    for (const key of [...this.senders.keys()]) if (key.endsWith(`|${g}`)) this.senders.delete(key);
    while (this.bases.size > 3) {
      const oldest = [...this.bases.keys()].find((k) => k !== g && k !== this.sendGeneration);
      if (oldest === undefined) break;
      this.bases.delete(oldest);
    }
  }

  hasGeneration(generation: number): boolean {
    return this.bases.has(generation & 0xff);
  }

  clear(): void {
    this.bases.clear();
    this.senders.clear();
    this.sendGeneration = null;
  }

  senderKey(userId: string, generation: number): Promise<SenderKey> | null {
    const g = generation & 0xff;
    const base = this.bases.get(g);
    if (!base) return null;
    const id = `${userId}|${g}`;
    let pending = this.senders.get(id);
    if (!pending) {
      pending = deriveSenderKey(base, userId, g, this.subtle);
      this.senders.set(id, pending);
    }
    return pending;
  }
}
