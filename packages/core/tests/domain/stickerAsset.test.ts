import { describe, expect, it } from 'vitest';
import { parseStickerLottie } from '../../src/domain/stickerAsset';

describe('sticker Lottie validation', () => {
  const valid = { v: '5.7', w: 320, h: 320, fr: 30, ip: 0, op: 60, layers: [] };
  it('accepts bounded self-contained animations', () => {
    expect(parseStickerLottie(JSON.stringify(valid)).assets).toEqual([]);
  });
  it('rejects external resources, expressions and excessive duration', () => {
    expect(() => parseStickerLottie(JSON.stringify({ ...valid, assets: [{ p: 'https://example.test/a.png' }] }))).toThrow();
    expect(() => parseStickerLottie(JSON.stringify({ ...valid, layers: [{ x: '1+1' }] }))).toThrow();
    expect(() => parseStickerLottie(JSON.stringify({ ...valid, op: 3000 }))).toThrow();
  });
});
