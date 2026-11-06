/**
 * Media frame protection primitives shared by the E2EE worker and its tests. Frames use the LiveKit
 * layout of domain/frameFormat (the same bytes the iOS native cryptor produces and accepts): AES-128-GCM,
 * a random-per-stream IV carried in the trailer, and one key per sender and key index. The key is
 * HKDF-SHA256(material, salt, 128 zero bytes), exactly what LiveKit's cryptor derives from the material.
 */
import { FRAME_KEY_SALT, IV_SIZE, keyIndexOf, packFrame, unencryptedPrefixLength, unpackFrame } from '@discordy/core/domain/frameFormat';

const TAG_BITS = 128;

export type MediaKind = 'audio' | 'video';

export async function importFrameKey(material: Uint8Array, subtle: SubtleCrypto = crypto.subtle): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', material as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(FRAME_KEY_SALT) as BufferSource, info: new Uint8Array(128) as BufferSource },
    base,
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * IVs of one outgoing stream: 8 random bytes chosen when the stream starts, then a 32-bit counter. A new stream
 * (a new call, a reconnect, another track) draws a new prefix, so an IV does not repeat under one key; the counter
 * refuses to wrap rather than repeat.
 */
export class IvSource {
  private counter = 0;
  private readonly prefix: Uint8Array;

  constructor(random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)) {
    this.prefix = random(new Uint8Array(IV_SIZE - 4));
  }

  next(): Uint8Array {
    if (this.counter === 0xffffffff) throw new Error('frame IV counter exhausted');
    this.counter += 1;
    const iv = new Uint8Array(IV_SIZE);
    iv.set(this.prefix, 0);
    new DataView(iv.buffer).setUint32(IV_SIZE - 4, this.counter, false);
    return iv;
  }
}

export async function encryptFrame(
  key: CryptoKey,
  iv: Uint8Array,
  keyIndex: number,
  kind: MediaKind,
  codec: string,
  data: Uint8Array,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<Uint8Array> {
  const prefix = unencryptedPrefixLength(kind, codec, data);
  const header = data.slice(0, prefix);
  const sealed = await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: header as BufferSource, tagLength: TAG_BITS }, key, data.slice(prefix) as BufferSource);
  return packFrame({ header, ciphertext: new Uint8Array(sealed), iv, keyIndex });
}

/** Returns the key index stamped on a frame, or null when the frame has no valid protection trailer. */
export function readKeyIndex(data: Uint8Array, kind: MediaKind, codec: string): number | null {
  const frame = unpackFrame(data, unencryptedPrefixLength(kind, codec, data));
  return frame ? frame.keyIndex : null;
}

/** Returns null for a frame that is not a valid protected frame. Throws when authentication fails. */
export async function decryptFrame(key: CryptoKey, kind: MediaKind, codec: string, data: Uint8Array, subtle: SubtleCrypto = crypto.subtle): Promise<Uint8Array | null> {
  const frame = unpackFrame(data, unencryptedPrefixLength(kind, codec, data));
  if (!frame) return null;
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: frame.iv as BufferSource, additionalData: frame.header as BufferSource, tagLength: TAG_BITS },
    key,
    frame.ciphertext as BufferSource,
  );
  const out = new Uint8Array(frame.header.length + plain.byteLength);
  out.set(frame.header, 0);
  out.set(new Uint8Array(plain), frame.header.length);
  return out;
}

/** Holds the AES key of every sender and key index. */
export class FrameKeyring {
  private readonly keys = new Map<string, CryptoKey>();
  /** Key index used for outgoing frames; null until activated, which keeps the sender silent. */
  sendKeyIndex: number | null = null;

  setKey(userId: string, keyIndex: number, key: CryptoKey): void {
    this.keys.set(`${userId}|${keyIndex}`, key);
  }

  key(userId: string, keyIndex: number): CryptoKey | null {
    return this.keys.get(`${userId}|${keyIndex}`) ?? null;
  }

  activate(generation: number): void {
    this.sendKeyIndex = keyIndexOf(generation);
  }

  clear(): void {
    this.keys.clear();
    this.sendKeyIndex = null;
  }
}
