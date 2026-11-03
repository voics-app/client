import { describe, expect, it } from 'vitest';
import { applyFormat, enterAction, plusMenuEntries, typingLine, wrapRange } from '@renderer/domain/composerFormat';
import { shouldPasteAsFile } from '@renderer/domain/composerLimits';

const key = (over: Partial<Parameters<typeof enterAction>[0]> = {}) => ({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, ...over });

describe('typingLine', () => {
  it('names up to three people, then falls back', () => {
    expect(typingLine([])).toBe('');
    expect(typingLine(['A'])).toBe('A is typing');
    expect(typingLine(['A', 'B'])).toBe('A and B are typing');
    expect(typingLine(['A', 'B', 'C'])).toBe('A, B, and C are typing');
    expect(typingLine(['A', 'B', 'C', 'D'])).toBe('Several people are typing');
  });
});

describe('paste threshold', () => {
  it('offers the file choice only above 2000 characters', () => {
    expect(shouldPasteAsFile('x'.repeat(2000))).toBe(false);
    expect(shouldPasteAsFile('x'.repeat(2001))).toBe(true);
  });
});

describe('enterAction', () => {
  it('sends on Enter and newlines on Shift+Enter by default', () => {
    expect(enterAction(key(), false)).toBe('send');
    expect(enterAction(key({ shiftKey: true }), false)).toBe('newline');
  });
  it('with Ctrl+Enter on, Enter is a newline and Ctrl or Cmd sends', () => {
    expect(enterAction(key(), true)).toBe('newline');
    expect(enterAction(key({ shiftKey: true }), true)).toBe('newline');
    expect(enterAction(key({ ctrlKey: true }), true)).toBe('send');
    expect(enterAction(key({ metaKey: true }), true)).toBe('send');
  });
  it('ignores other keys and IME composition', () => {
    expect(enterAction(key({ key: 'a' }), false)).toBe('none');
    expect(enterAction(key({ isComposing: true }), false)).toBe('none');
  });
});

describe('format wrapping', () => {
  it('wraps and unwraps a selection', () => {
    const w = wrapRange('hello world', 0, 5, '**');
    expect(w).toEqual({ text: '**hello** world', start: 2, end: 7 });
    expect(wrapRange(w.text, w.start, w.end, '**').text).toBe('hello world');
  });
  it('covers every mark', () => {
    expect(applyFormat('a', 0, 1, 'italic').text).toBe('*a*');
    expect(applyFormat('a', 0, 1, 'strike').text).toBe('~~a~~');
    expect(applyFormat('a', 0, 1, 'spoiler').text).toBe('||a||');
    expect(applyFormat('a', 0, 1, 'code').text).toBe('`a`');
  });
  it('quotes every touched line and toggles back', () => {
    const q = applyFormat('one\ntwo\nthree', 1, 6, 'quote');
    expect(q.text).toBe('> one\n> two\nthree');
    expect(applyFormat(q.text, 0, 11, 'quote').text).toBe('one\ntwo\nthree');
  });
});

describe('plusMenuEntries', () => {
  it('only lists upload until the features exist', () => {
    expect(plusMenuEntries()).toEqual(['upload']);
    expect(plusMenuEntries({ threads: true, polls: true, apps: true })).toEqual(['upload', 'thread', 'poll', 'apps']);
  });
});
