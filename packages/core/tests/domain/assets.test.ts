import { describe, expect, it } from 'vitest';
import { assetCandidates } from '@discordy/core/domain/assets';

describe('assetCandidates', () => {
  it('requests animated (a_) images as gif first', () => {
    expect(assetCandidates('https://cdn', 'icons', '1', 'a_abc')).toEqual(['https://cdn/icons/1/a_abc.gif?size=128', 'https://cdn/icons/1/a_abc.png?size=128']);
  });

  it('requests static images as png, then the legacy extensions', () => {
    expect(assetCandidates('https://cdn', 'avatars', '2', 'abc', 64)).toEqual([
      'https://cdn/avatars/2/abc.png?size=64',
      'https://cdn/avatars/2/abc.gif?size=64',
      'https://cdn/avatars/2/abc.webp?size=64',
      'https://cdn/avatars/2/abc.jpg?size=64',
    ]);
  });
});
