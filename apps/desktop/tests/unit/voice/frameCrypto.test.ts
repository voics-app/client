import { describe, expect, it } from 'vitest';
import { FrameKeyring, decryptFrame, deriveSenderKey, encryptFrame, importEpochBase, readGeneration } from '@renderer/workers/frameCrypto';

const secret = new Uint8Array(32).map((_, i) => i + 1);

describe('frame crypto', () => {
  it('round-trips audio frames and hides the payload', async () => {
    const base = await importEpochBase(secret);
    const key = await deriveSenderKey(base, '42', 3);
    const plain = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const sealed = await encryptFrame(key, 1, 3, 'audio', 'opus', plain);
    expect(sealed.length).toBeGreaterThan(plain.length + 16);
    expect(readGeneration(sealed, 'audio', 'opus')).toBe(3);
    expect(Array.from((await decryptFrame(key, 'audio', 'opus', sealed))!)).toEqual(Array.from(plain));
  });

  it('keeps the VP8 clear prefix and authenticates it', async () => {
    const base = await importEpochBase(secret);
    const key = await deriveSenderKey(base, '42', 1);
    const frame = new Uint8Array(40).map((_, i) => (i === 0 ? 0x00 : i)); // key frame: 10 byte prefix
    const sealed = await encryptFrame(key, 7, 1, 'video', 'VP8', frame);
    expect(Array.from(sealed.slice(0, 10))).toEqual(Array.from(frame.slice(0, 10)));
    expect(Array.from((await decryptFrame(key, 'video', 'VP8', sealed))!)).toEqual(Array.from(frame));
    sealed[2] = (sealed[2] ?? 0) ^ 0xff;
    await expect(decryptFrame(key, 'video', 'VP8', sealed)).rejects.toThrow();
  });

  it('rejects another sender key and another generation', async () => {
    const base = await importEpochBase(secret);
    const alice = await deriveSenderKey(base, 'alice', 1);
    const bob = await deriveSenderKey(base, 'bob', 1);
    const sealed = await encryptFrame(alice, 1, 1, 'audio', 'opus', new Uint8Array([9, 9, 9]));
    await expect(decryptFrame(bob, 'audio', 'opus', sealed)).rejects.toThrow();
    const next = await deriveSenderKey(base, 'alice', 2);
    await expect(decryptFrame(next, 'audio', 'opus', sealed)).rejects.toThrow();
  });

  it('returns null for unprotected frames', async () => {
    const base = await importEpochBase(secret);
    const key = await deriveSenderKey(base, 'a', 0);
    expect(await decryptFrame(key, 'audio', 'opus', new Uint8Array(40))).toBeNull();
    expect(readGeneration(new Uint8Array(40), 'audio', 'opus')).toBeNull();
  });

  it('keyring derives per sender, caches, and tracks epochs', async () => {
    const ring = new FrameKeyring();
    expect(ring.senderKey('a', 1)).toBeNull();
    ring.setEpoch(1, await importEpochBase(secret));
    expect(ring.hasGeneration(1)).toBe(true);
    const first = ring.senderKey('a', 1);
    expect(ring.senderKey('a', 1)).toBe(first);
    ring.clear();
    expect(ring.hasGeneration(1)).toBe(false);
    expect(ring.sendGeneration).toBeNull();
  });
});
