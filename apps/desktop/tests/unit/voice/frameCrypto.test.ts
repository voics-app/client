import { describe, expect, it } from 'vitest';
import { FrameKeyring, IvSource, decryptFrame, encryptFrame, importFrameKey, readKeyIndex } from '@renderer/workers/frameCrypto';

const hex = (value: string): Uint8Array => Uint8Array.from(value.match(/../g)!.map((byte) => parseInt(byte, 16)));
const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/**
 * Reference vectors computed independently with node:crypto from the steps of LiveKit's libwebrtc cryptor
 * (api/crypto/frame_crypto_transformer.cc, m150): key = HKDF-SHA256(material, salt "voics-frame-key", 128 zero bytes)
 * -> 16 bytes, AES-128-GCM with the clear header as AAD, frame = header | ciphertext | tag | IV | 12 | key index.
 * The iPhone's native cryptor produces and accepts exactly these bytes.
 */
const MATERIAL = hex('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20');
const IV = hex('a0a1a2a3a4a5a6a7a8a9aaab');
const OPUS = hex('030a11181f262d343b424950575e656c737a8188');
const OPUS_SEALED = hex('03d7abec4de2699dd042a567eb91a560384691d8415cdf6d8870fdff567de1a7d1f17e85a0a1a2a3a4a5a6a7a8a9aaab0c05');
const VP8_KEY = hex('10060b10151a1f24292e33383d42474c51565b60656a6f74797e83888d92');
const VP8_SEALED = hex('10060b10151a1f24292eee82c9108308f8bd5b8c52d6a0b47535bf98ddfaf4328a0bb99675efc4e40ade40554a3fa0a1a2a3a4a5a6a7a8a9aaab0c05');

describe('frame crypto against the LiveKit reference vectors', () => {
  it('seals an Opus frame to exactly the bytes of the reference (1 clear byte, IV and key index in the trailer)', async () => {
    const key = await importFrameKey(MATERIAL);
    expect(toHex(await encryptFrame(key, IV, 5, 'audio', 'opus', OPUS))).toBe(toHex(OPUS_SEALED));
  });

  it('seals a VP8 key frame to exactly the bytes of the reference (10 clear bytes)', async () => {
    const key = await importFrameKey(MATERIAL);
    expect(toHex(await encryptFrame(key, IV, 5, 'video', 'VP8', VP8_KEY))).toBe(toHex(VP8_SEALED));
  });

  it('opens frames made by the native cryptor (the reference bytes) and returns the original frame', async () => {
    const key = await importFrameKey(MATERIAL);
    expect(toHex((await decryptFrame(key, 'audio', 'opus', OPUS_SEALED))!)).toBe(toHex(OPUS));
    expect(toHex((await decryptFrame(key, 'video', 'VP8', VP8_SEALED))!)).toBe(toHex(VP8_KEY));
    expect(readKeyIndex(OPUS_SEALED, 'audio', 'opus')).toBe(5);
  });

  it('rejects a frame with a flipped bit, a tampered clear header, or another sender key', async () => {
    const key = await importFrameKey(MATERIAL);
    const flipped = OPUS_SEALED.slice();
    flipped[10] = (flipped[10] ?? 0) ^ 1;
    await expect(decryptFrame(key, 'audio', 'opus', flipped)).rejects.toThrow();
    const header = OPUS_SEALED.slice();
    header[0] = 0x04;
    await expect(decryptFrame(key, 'audio', 'opus', header)).rejects.toThrow();
    const other = await importFrameKey(new Uint8Array(32).fill(9));
    await expect(decryptFrame(other, 'audio', 'opus', OPUS_SEALED)).rejects.toThrow();
  });

  it('treats anything without a valid trailer as not protected, including the retired counter format', async () => {
    const key = await importFrameKey(MATERIAL);
    expect(await decryptFrame(key, 'audio', 'opus', new Uint8Array(60))).toBeNull();
    const retired = new Uint8Array(60);
    retired.set([0, 0, 0, 7, 3, 8, 0xfa, 0xfa], 52);
    expect(await decryptFrame(key, 'audio', 'opus', retired)).toBeNull();
    expect(readKeyIndex(retired, 'audio', 'opus')).toBeNull();
  });

  it('refuses H264 frames rather than guess its clear header', async () => {
    const key = await importFrameKey(MATERIAL);
    await expect(encryptFrame(key, IV, 1, 'video', 'H264', new Uint8Array(40))).rejects.toThrow(/H264/);
  });
});

describe('IV source', () => {
  it('never repeats an IV within a stream and refuses to wrap', () => {
    const ivs = new IvSource((bytes) => bytes.fill(7));
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(toHex(ivs.next()));
    expect(seen.size).toBe(1000);
    const exhausted = new IvSource((bytes) => bytes.fill(7));
    (exhausted as unknown as { counter: number }).counter = 0xffffffff;
    expect(() => exhausted.next()).toThrow(/exhausted/);
  });

  it('starts each stream with a fresh random prefix, so streams under one key do not share IVs', () => {
    const a = new IvSource();
    const b = new IvSource();
    expect(toHex(a.next().slice(0, 8))).not.toBe(toHex(b.next().slice(0, 8)));
  });

  it('round-trips a frame sealed with a stream IV', async () => {
    const key = await importFrameKey(MATERIAL);
    const sealed = await encryptFrame(key, new IvSource().next(), 3, 'audio', 'opus', OPUS);
    expect(toHex((await decryptFrame(key, 'audio', 'opus', sealed))!)).toBe(toHex(OPUS));
  });
});

describe('FrameKeyring', () => {
  it('keeps keys per sender and key index and stays silent until activated', async () => {
    const ring = new FrameKeyring();
    const key = await importFrameKey(MATERIAL);
    expect(ring.sendKeyIndex).toBeNull();
    ring.setKey('a', 5, key);
    expect(ring.key('a', 5)).toBe(key);
    expect(ring.key('a', 6)).toBeNull();
    expect(ring.key('b', 5)).toBeNull();
    ring.activate(5);
    expect(ring.sendKeyIndex).toBe(5);
    ring.clear();
    expect(ring.key('a', 5)).toBeNull();
    expect(ring.sendKeyIndex).toBeNull();
  });
});
