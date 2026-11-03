import { describe, expect, it } from 'vitest';
import { isEmojiOnly } from '@renderer/domain/emojiOnly';

describe('isEmojiOnly', () => {
  it('accepts unicode emoji with and without spaces', () => {
    expect(isEmojiOnly('\u{1F600}')).toBe(true);
    expect(isEmojiOnly('\u{1F600}\u{1F600} \u{1F600}')).toBe(true);
  });
  it('accepts ZWJ sequences, flags, keycaps and skin tones as one emoji each', () => {
    expect(isEmojiOnly('\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}')).toBe(true);
    expect(isEmojiOnly('\u{1F1F3}\u{1F1F1}')).toBe(true);
    expect(isEmojiOnly('1️⃣')).toBe(true);
    expect(isEmojiOnly('\u{1F44D}\u{1F3FD}')).toBe(true);
  });
  it('accepts custom emoji mixed with unicode', () => {
    expect(isEmojiOnly('<:blob:123456> <a:party:99>\u{1F600}')).toBe(true);
  });
  it('rejects text, digits and empty input', () => {
    expect(isEmojiOnly('hi \u{1F600}')).toBe(false);
    expect(isEmojiOnly('1')).toBe(false);
    expect(isEmojiOnly('   ')).toBe(false);
    expect(isEmojiOnly('')).toBe(false);
  });
  it('allows 27 emoji but not 28', () => {
    expect(isEmojiOnly('\u{1F600}'.repeat(27))).toBe(true);
    expect(isEmojiOnly('\u{1F600}'.repeat(28))).toBe(false);
  });
});
