import { describe, expect, it } from 'vitest';
import { decodeUtf8, encodeUtf8 } from '../../src/domain/utf8';

const SAMPLES = ['', 'plain ascii', 'héllo wörld', '€ 100', '日本語', 'wave \u{1f44b} and \u{1f9d1}‍\u{1f4bb}', 'mixed é€\u{1f600} end'];

describe('utf8', () => {
  it.each(SAMPLES)('encodes %j like TextEncoder', (text) => {
    expect(Array.from(encodeUtf8(text))).toEqual(Array.from(new TextEncoder().encode(text)));
  });

  it.each(SAMPLES)('round-trips %j', (text) => {
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
  });

  it('writes U+FFFD for a lone surrogate, as TextEncoder does', () => {
    expect(Array.from(encodeUtf8('a\ud800b'))).toEqual(Array.from(new TextEncoder().encode('a\ud800b')));
  });

  it.each([
    ['a stray continuation byte', [0x61, 0x80, 0x62]],
    ['a truncated sequence', [0xe2, 0x82]],
    ['an overlong encoding', [0xc0, 0xaf]],
    ['a surrogate encoded as UTF-8', [0xed, 0xa0, 0x80]],
    ['a code point above U+10FFFF', [0xf4, 0x90, 0x80, 0x80]],
    ['an impossible lead byte', [0xff, 0x41]],
  ])('decodes %s like TextDecoder', (_name, bytes) => {
    const input = Uint8Array.from(bytes);
    expect(decodeUtf8(input)).toBe(new TextDecoder().decode(input));
  });
});
