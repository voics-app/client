import { describe, expect, it } from 'vitest';
import {
  E2EE_PROTOCOL_VERSION,
  NO_KEY_INDEX,
  frameKeyLabel,
  isE2eeVideoCodec,
  keyIndexOf,
  packFrame,
  unencryptedPrefixLength,
  unpackFrame,
} from '@discordy/core/domain/frameFormat';

const hex = (value: string): Uint8Array => Uint8Array.from(value.match(/../g)!.map((byte) => parseInt(byte, 16)));

/**
 * Computed independently of this code with node:crypto, following the steps of LiveKit's libwebrtc
 * frame_crypto_transformer.cc (m150): key = HKDF-SHA256(material, salt "voics-frame-key", 128 zero
 * bytes) -> 16 bytes, AES-128-GCM with the clear header as AAD, frame = header | ciphertext | tag | IV | 12 | key index.
 */
const OPUS_SEALED = hex('03d7abec4de2699dd042a567eb91a560384691d8415cdf6d8870fdff567de1a7d1f17e85a0a1a2a3a4a5a6a7a8a9aaab0c05');

describe('frame format (LiveKit layout, protocol 2)', () => {
  it('unpacks the reference Opus frame: 1 clear byte, ciphertext with tag, IV, 12, key index', () => {
    const frame = unpackFrame(OPUS_SEALED, 1)!;
    expect(Array.from(frame.header)).toEqual([0x03]);
    expect(frame.ciphertext.length).toBe(19 + 16);
    expect(Buffer.from(frame.iv).toString('hex')).toBe('a0a1a2a3a4a5a6a7a8a9aaab');
    expect(frame.keyIndex).toBe(5);
  });

  it('packs back to the same bytes', () => {
    const frame = unpackFrame(OPUS_SEALED, 1)!;
    expect(Array.from(packFrame(frame))).toEqual(Array.from(OPUS_SEALED));
  });

  it('rejects frames that are too short, have no 12-byte IV marker, or carry the retired counter trailer', () => {
    expect(unpackFrame(new Uint8Array(20), 1)).toBeNull();
    const wrongMarker = OPUS_SEALED.slice();
    wrongMarker[wrongMarker.length - 2] = 8;
    expect(unpackFrame(wrongMarker, 1)).toBeNull();
    const v1 = new Uint8Array(60);
    v1.set([0, 0, 0, 7, 3, 8, 0xfa, 0xfa], 52);
    expect(unpackFrame(v1, 1)).toBeNull();
  });

  it('announces protocol 2 as the only version', () => {
    expect(E2EE_PROTOCOL_VERSION).toBe(2);
  });

  it('refuses an IV that is not 12 bytes', () => {
    expect(() => packFrame({ header: new Uint8Array(1), ciphertext: new Uint8Array(16), iv: new Uint8Array(8), keyIndex: 0 })).toThrow();
  });

  it('uses LiveKit clear header lengths: Opus 1, VP8 key 10 and delta 3, VP9 and AV1 0', () => {
    expect(unencryptedPrefixLength('audio', 'opus', new Uint8Array(5))).toBe(1);
    expect(unencryptedPrefixLength('video', 'VP8', new Uint8Array([0x10]))).toBe(10);
    expect(unencryptedPrefixLength('video', 'vp8', new Uint8Array([0x11]))).toBe(3);
    expect(unencryptedPrefixLength('video', 'VP9', new Uint8Array(5))).toBe(0);
    expect(unencryptedPrefixLength('video', 'AV1', new Uint8Array(5))).toBe(0);
  });

  it('does not cover H264: end-to-end encrypted calls refuse it', () => {
    expect(() => unencryptedPrefixLength('video', 'H264', new Uint8Array(5))).toThrow(/H264/);
    expect(isE2eeVideoCodec('H264')).toBe(false);
    expect(['VP8', 'vp9', 'AV1'].every(isE2eeVideoCodec)).toBe(true);
  });

  it('names key material by sender and key index, and never uses the reserved index', () => {
    expect(frameKeyLabel('42', 5)).toBe('voics-voice-frame-key|42|5');
    expect(frameKeyLabel('42', 5)).not.toBe(frameKeyLabel('43', 5));
    for (let generation = 0; generation < 512; generation += 1) expect(keyIndexOf(generation)).not.toBe(NO_KEY_INDEX);
    expect(keyIndexOf(5)).toBe(5);
    expect(keyIndexOf(256 + 5)).toBe(5);
  });
});
