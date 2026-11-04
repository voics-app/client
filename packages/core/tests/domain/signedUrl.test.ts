import { describe, expect, it } from 'vitest';
import { isExpiring, signedUrlExpiryMs } from '@discordy/core/domain/signedUrl';

const url = (ex: string) => `http://cdn/attachments/1/2/a.png?ex=${ex}&is=1&hm=ab`;

describe('signed attachment URLs', () => {
  it('reads the hex expiry in milliseconds', () => {
    expect(signedUrlExpiryMs(url('6b4b2380'))).toBe(0x6b4b2380 * 1000);
  });

  it('treats unsigned, blob and malformed URLs as non-expiring', () => {
    for (const plain of ['blob:abc', 'http://cdn/a.png', url('zz'), url('')]) {
      expect(signedUrlExpiryMs(plain)).toBeNull();
      expect(isExpiring(plain, Date.now())).toBe(false);
    }
  });

  it('flags links that expired or expire within the margin', () => {
    const expiry = 0x6b4b2380 * 1000;
    expect(isExpiring(url('6b4b2380'), expiry - 600_000)).toBe(false);
    expect(isExpiring(url('6b4b2380'), expiry - 30_000)).toBe(true);
    expect(isExpiring(url('6b4b2380'), expiry + 1)).toBe(true);
  });
});
