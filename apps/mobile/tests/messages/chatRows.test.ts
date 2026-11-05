import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { buildRows, showJumpToLatest } from '../../src/messages/chatRows';
import { isMultiline } from '../../src/messages/Composer';

const msg = (id: string, author: string, extra: Partial<ChatMessage> = {}) =>
  ({ id, author: { id: author }, content: id, timestamp: '2026-01-01T10:00:00.000Z', type: 0, ...extra }) as ChatMessage;

describe('buildRows', () => {
  const list = [msg('1', 'a'), msg('2', 'a'), msg('3', 'b'), msg('4', 'b')];

  it('lists the newest first and groups consecutive messages of one author', () => {
    const rows = buildRows(list, null);
    expect(rows.map((r) => r.key)).toEqual(['4', '3', '2', '1']);
    expect(rows.filter((r) => r.kind === 'message' && r.showHeader).map((r) => r.key)).toEqual(['3', '1']);
  });

  it('puts the New divider above the first unread message and starts a group there', () => {
    const rows = buildRows(list, '4');
    expect(rows.map((r) => r.key)).toEqual(['4', 'new', '3', '2', '1']);
    const four = rows[0]!;
    expect(four.kind === 'message' && four.showHeader).toBe(true);
  });
});

describe('showJumpToLatest', () => {
  it('shows after scrolling more than one and a half screens from the newest message', () => {
    expect(showJumpToLatest(400, 600)).toBe(false);
    expect(showJumpToLatest(1000, 600)).toBe(true);
  });
});

describe('composer line state', () => {
  it('treats content shorter than two lines as one line, so the buttons centre on it', () => {
    expect(isMultiline(21)).toBe(false);
    expect(isMultiline(30)).toBe(false);
    expect(isMultiline(42)).toBe(true);
  });
});
