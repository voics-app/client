/**
 * DAVE-style media frame layout for end-to-end encrypted voice/video:
 *
 *   [clear codec header][AES-GCM ciphertext + 16-byte tag][counter u32 BE][generation u8][trailer size u8][0xFA 0xFA]
 *
 * The SFU only sees RTP headers; frame payloads are opaque. The clear prefix
 * keeps what Chromium's packetizer must parse (VP8 payload header).
 */

export const FRAME_MAGIC = [0xfa, 0xfa];
const TRAILER_SIZE = 4 + 1 + 1 + FRAME_MAGIC.length;

export interface ProtectedFrame {
  header: Uint8Array;
  ciphertext: Uint8Array;
  counter: number;
  generation: number;
}

export function packFrame(frame: ProtectedFrame): Uint8Array {
  const out = new Uint8Array(frame.header.length + frame.ciphertext.length + TRAILER_SIZE);
  out.set(frame.header, 0);
  out.set(frame.ciphertext, frame.header.length);
  const view = new DataView(out.buffer);
  const trailerAt = frame.header.length + frame.ciphertext.length;
  view.setUint32(trailerAt, frame.counter >>> 0, false);
  out[trailerAt + 4] = frame.generation & 0xff;
  out[trailerAt + 5] = TRAILER_SIZE;
  out[trailerAt + 6] = FRAME_MAGIC[0]!;
  out[trailerAt + 7] = FRAME_MAGIC[1]!;
  return out;
}

export function unpackFrame(data: Uint8Array, headerLength: number): ProtectedFrame | null {
  if (data.length < headerLength + TRAILER_SIZE + 16) return null;
  if (data[data.length - 2] !== FRAME_MAGIC[0] || data[data.length - 1] !== FRAME_MAGIC[1]) return null;
  if (data[data.length - 3] !== TRAILER_SIZE) return null;
  const trailerAt = data.length - TRAILER_SIZE;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    header: data.slice(0, headerLength),
    ciphertext: data.slice(headerLength, trailerAt),
    counter: view.getUint32(trailerAt, false),
    generation: data[trailerAt + 4]!,
  };
}

/** XORs the big-endian counter into the last four bytes of the per-sender salt. */
export function buildIv(counter: number, salt: Uint8Array): Uint8Array {
  const iv = new Uint8Array(12);
  iv.set(salt.slice(0, 12));
  const c = counter >>> 0;
  iv[8] = iv[8]! ^ ((c >>> 24) & 0xff);
  iv[9] = iv[9]! ^ ((c >>> 16) & 0xff);
  iv[10] = iv[10]! ^ ((c >>> 8) & 0xff);
  iv[11] = iv[11]! ^ (c & 0xff);
  return iv;
}

export function unencryptedPrefixLength(kind: 'audio' | 'video', codec: string, frame: Uint8Array): number {
  if (kind === 'audio') return 0;
  if (codec.toUpperCase() === 'VP8') {
    const isKeyFrame = ((frame[0] ?? 1) & 0x01) === 0;
    return isKeyFrame ? 10 : 3;
  }
  return 0;
}
