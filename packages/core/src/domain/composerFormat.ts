/** Pure helpers for the composer: selection formatting, the send key and the typing line. */

export type FormatKind = 'bold' | 'italic' | 'strike' | 'spoiler' | 'code' | 'quote';

export const FORMAT_MARKS: Record<Exclude<FormatKind, 'quote'>, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  spoiler: '||',
  code: '`',
};

export interface TextEdit {
  text: string;
  start: number;
  end: number;
}

/** Wraps [start, end) in `mark`, or removes the mark when the selection is already wrapped. */
export function wrapRange(text: string, start: number, end: number, mark: string): TextEdit {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  const n = mark.length;
  if (a >= n && text.slice(a - n, a) === mark && text.slice(b, b + n) === mark) {
    return { text: text.slice(0, a - n) + text.slice(a, b) + text.slice(b + n), start: a - n, end: b - n };
  }
  return { text: `${text.slice(0, a)}${mark}${text.slice(a, b)}${mark}${text.slice(b)}`, start: a + n, end: b + n };
}

/** Prefixes every line touched by the selection with `> `, or strips the prefix when all of them have it. */
export function quoteRange(text: string, start: number, end: number): TextEdit {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  const lineStart = text.lastIndexOf('\n', a - 1) + 1;
  const nl = text.indexOf('\n', b);
  const lineEnd = nl === -1 ? text.length : nl;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const allQuoted = lines.every((l) => l.startsWith('> '));
  const next = lines.map((l) => (allQuoted ? l.slice(2) : `> ${l}`)).join('\n');
  const delta = allQuoted ? -2 : 2;
  return {
    text: text.slice(0, lineStart) + next + text.slice(lineEnd),
    start: Math.max(lineStart, a + delta),
    end: b + delta * lines.length,
  };
}

export function applyFormat(text: string, start: number, end: number, kind: FormatKind): TextEdit {
  return kind === 'quote' ? quoteRange(text, start, end) : wrapRange(text, start, end, FORMAT_MARKS[kind]);
}

export interface SendKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}

/**
 * What Enter does in the composer. With "Send with Ctrl+Enter" on, plain Enter inserts a newline and only
 * Ctrl/Cmd+Enter sends; otherwise Enter sends and Shift+Enter inserts a newline.
 */
export function enterAction(e: SendKeyEvent, sendWithCtrlEnter: boolean): 'send' | 'newline' | 'none' {
  if (e.key !== 'Enter' || e.isComposing) return 'none';
  if (sendWithCtrlEnter) return e.ctrlKey || e.metaKey ? 'send' : 'newline';
  return e.shiftKey ? 'newline' : 'send';
}

/** The line under the message list: names up to three people before falling back to "Several". */
export function typingLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
  return 'Several people are typing';
}

export type PlusEntryId = 'upload' | 'thread' | 'poll' | 'apps';

/** Features that are not built yet; flip a flag when its backend and UI land and the entry appears. */
export const COMPOSER_FEATURES = { threads: false, polls: false, apps: false } as const;

export function plusMenuEntries(features: { threads: boolean; polls: boolean; apps: boolean } = COMPOSER_FEATURES): PlusEntryId[] {
  const entries: PlusEntryId[] = ['upload'];
  if (features.threads) entries.push('thread');
  if (features.polls) entries.push('poll');
  if (features.apps) entries.push('apps');
  return entries;
}
