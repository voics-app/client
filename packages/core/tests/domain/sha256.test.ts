import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { sha256, sha256Hex } from '../../src/domain/sha256';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('sha256', () => {
  it('matches the published test vectors', () => {
    expect(hex(sha256(new Uint8Array()))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it.each([55, 56, 63, 64, 65, 119, 120, 1000, 4096])('matches node for %i bytes (block boundaries)', (length) => {
    const data = Uint8Array.from({ length }, (_v, i) => (i * 31 + 7) & 0xff);
    expect(hex(sha256(data))).toBe(createHash('sha256').update(data).digest('hex'));
  });

  it('hashes text through WebCrypto when it exists and through the fallback when it does not', async () => {
    const withSubtle = await sha256Hex('key-a|key-b');
    vi.stubGlobal('crypto', undefined);
    try {
      expect(await sha256Hex('key-a|key-b')).toBe(withSubtle);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(withSubtle).toBe(createHash('sha256').update('key-a|key-b').digest('hex'));
  });
});
