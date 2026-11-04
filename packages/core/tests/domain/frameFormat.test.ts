import { describe, expect, it } from 'vitest';
import { FRAME_MAGIC, buildIv, packFrame, unencryptedPrefixLength, unpackFrame } from '@discordy/core/domain/frameFormat';

describe('frameFormat', () => {
  it('packs and unpacks a protected frame', () => {
    const header = new Uint8Array([1, 2, 3]);
    const ciphertext = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 7]);
    const packed = packFrame({ header, ciphertext, counter: 0x01020304, generation: 5 });
    expect(Array.from(packed.slice(-2))).toEqual(FRAME_MAGIC);
    const unpacked = unpackFrame(packed, 3);
    expect(unpacked).not.toBeNull();
    expect(Array.from(unpacked!.header)).toEqual([1, 2, 3]);
    expect(Array.from(unpacked!.ciphertext)).toEqual(Array.from(ciphertext));
    expect(unpacked!.counter).toBe(0x01020304);
    expect(unpacked!.generation).toBe(5);
  });

  it('returns null for frames without the magic marker (unprotected passthrough)', () => {
    expect(unpackFrame(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), 0)).toBeNull();
  });

  it('derives a 12-byte IV from the counter and a per-sender salt', () => {
    const iv = buildIv(1, new Uint8Array(12).fill(0xff));
    expect(iv).toHaveLength(12);
    expect(iv[11]).toBe(0xfe);
    expect(iv[0]).toBe(0xff);
  });

  it('keeps codec headers the packetizer needs in the clear', () => {
    expect(unencryptedPrefixLength('audio', 'opus', new Uint8Array([0]))).toBe(0);
    expect(unencryptedPrefixLength('video', 'VP8', new Uint8Array([0b0000_0000]))).toBe(10);
    expect(unencryptedPrefixLength('video', 'VP8', new Uint8Array([0b0000_0001]))).toBe(3);
    expect(unencryptedPrefixLength('video', 'VP9', new Uint8Array([0]))).toBe(0);
  });
});
