import { describe, expect, it } from 'vitest';
import { replyPreviewText, spoilersOpen } from '@discordy/core/domain/chatDisplay';
import { convertEmoticons } from '@discordy/core/domain/emoticons';

describe('spoilersOpen', () => {
  it('opens on click only, for moderators, or always', () => {
    expect(spoilersOpen('click', true)).toBe(false);
    expect(spoilersOpen('moderated', true)).toBe(true);
    expect(spoilersOpen('moderated', false)).toBe(false);
    expect(spoilersOpen('always', false)).toBe(true);
  });
});

describe('replyPreviewText', () => {
  it('keeps the text as is unless compact', () => {
    expect(replyPreviewText('a\nb', false)).toBe('a\nb');
  });
  it('flattens and shortens when compact', () => {
    expect(replyPreviewText('a\n\n  b', true)).toBe('a b');
    const out = replyPreviewText('x'.repeat(200), true);
    expect(out.length).toBe(80);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('convertEmoticons', () => {
  it('converts standalone emoticons', () => {
    expect(convertEmoticons('hi :) and :D ;) <3')).toBe('hi 🙂 and 😄 😉 ❤️');
    expect(convertEmoticons(':(')).toBe('🙁');
    expect(convertEmoticons('ok :)!')).toBe('ok 🙂!');
  });
  it('leaves URLs, words, custom emoji and code alone', () => {
    expect(convertEmoticons('https://x.test :/ a:) <:smile:123>')).toBe('https://x.test :/ a:) <:smile:123>');
    expect(convertEmoticons('`:)` and ```\n:)\n``` :)')).toBe('`:)` and ```\n:)\n``` 🙂');
  });
});
