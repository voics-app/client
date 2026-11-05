/**
 * Media frame layout of voice E2EE (DAVE protocol_version 2, the only version): the layout of LiveKit's libwebrtc frame cryptor
 * (api/crypto/frame_crypto_transformer.cc), which is the only frame cryptor iOS can run without a
 * custom WebRTC build. Desktop implements it in its frame worker, the phone uses the native one.
 *
 *   [clear header][AES-128-GCM ciphertext + 16-byte tag][IV, 12 bytes][12][key index u8]
 *
 * The header is the authenticated data. It is 1 byte for Opus (the TOC byte), 10 or 3 bytes for a VP8
 * key or delta frame, and 0 for VP9 and AV1. H.264 would need NAL parsing and RBSP escaping, so E2EE
 * calls accept only the codecs listed in `E2EE_VIDEO_CODECS`.
 *
 * Keys: each sender has one AES key per key index, derived by the cryptor from 32 bytes of key material
 * as HKDF-SHA256(material, salt = FRAME_KEY_SALT, info = 128 zero bytes). The material is an MLS
 * exporter secret whose label names the sender and the key index (`frameKeyLabel`), so every epoch
 * and every sender gets its own key.
 */

export const IV_SIZE = 12;
export const TAG_SIZE = 16;
const TRAILER_SIZE = IV_SIZE + 2;

/** Key indexes are the epoch number modulo this ring size. */
export const KEY_RING_SIZE = 128;
/** Reserved index that never holds a key: a sender pointed at it drops every frame. */
export const NO_KEY_INDEX = KEY_RING_SIZE - 1;
/** Usable indexes: 0 .. NO_KEY_INDEX - 1. */
export const USABLE_KEY_INDEXES = NO_KEY_INDEX;

export const E2EE_PROTOCOL_VERSION = 2;

export const FRAME_KEY_SALT = 'voics-frame-key';
export const FRAME_KEY_LABEL = 'voics-voice-frame-key';
export const FRAME_KEY_MATERIAL_BYTES = 32;

/** Video codecs whose clear header is simple enough to match LiveKit's cryptor exactly. */
export const E2EE_VIDEO_CODECS = ['VP8', 'VP9', 'AV1'] as const;

export const isE2eeVideoCodec = (codec: string): boolean => (E2EE_VIDEO_CODECS as readonly string[]).includes(codec.toUpperCase());

export const keyIndexOf = (generation: number): number => (generation & 0xff) % USABLE_KEY_INDEXES;

export const frameKeyLabel = (userId: string, keyIndex: number): string => `${FRAME_KEY_LABEL}|${userId}|${keyIndex}`;

export interface ProtectedFrame {
  header: Uint8Array;
  /** Ciphertext followed by the 16-byte tag. */
  ciphertext: Uint8Array;
  iv: Uint8Array;
  keyIndex: number;
}

export function packFrame(frame: ProtectedFrame): Uint8Array {
  if (frame.iv.length !== IV_SIZE) throw new Error('frame IV must be 12 bytes');
  const out = new Uint8Array(frame.header.length + frame.ciphertext.length + TRAILER_SIZE);
  out.set(frame.header, 0);
  out.set(frame.ciphertext, frame.header.length);
  const at = frame.header.length + frame.ciphertext.length;
  out.set(frame.iv, at);
  out[at + IV_SIZE] = IV_SIZE;
  out[at + IV_SIZE + 1] = frame.keyIndex & 0xff;
  return out;
}

/** Returns null when the data is too short or its trailer does not name a 12-byte IV. */
export function unpackFrame(data: Uint8Array, headerLength: number): ProtectedFrame | null {
  if (data.length < headerLength + TRAILER_SIZE + TAG_SIZE) return null;
  if (data[data.length - 2] !== IV_SIZE) return null;
  const at = data.length - TRAILER_SIZE;
  return {
    header: data.slice(0, headerLength),
    ciphertext: data.slice(headerLength, at),
    iv: data.slice(at, at + IV_SIZE),
    keyIndex: data[data.length - 1]!,
  };
}

/** The clear header length of LiveKit's cryptor. Throws for a codec this format does not cover. */
export function unencryptedPrefixLength(kind: 'audio' | 'video', codec: string, frame: Uint8Array): number {
  if (kind === 'audio') return 1;
  switch (codec.toUpperCase()) {
    case 'VP8':
      return ((frame[0] ?? 1) & 0x01) === 0 ? 10 : 3;
    case 'VP9':
    case 'AV1':
      return 0;
    default:
      throw new Error(`end-to-end encryption does not support ${codec} video`);
  }
}
