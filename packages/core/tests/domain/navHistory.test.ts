import { describe, expect, it } from 'vitest';
import { canGo, emptyHistory, pushView, stepHistory } from '@discordy/core/domain/navHistory';
import { pickUnreadChannel } from '@discordy/core/domain/unreadNav';

describe('nav history', () => {
  it('goes back and forward and drops forward entries on a new visit', () => {
    let h = emptyHistory<string>();
    for (const v of ['a', 'b', 'c']) h = pushView(h, v);
    expect(canGo(h, 1)).toBe(false);
    h = stepHistory(h, -1);
    expect(h.entries[h.index]).toBe('b');
    h = stepHistory(h, 1);
    expect(h.entries[h.index]).toBe('c');
    h = pushView(stepHistory(stepHistory(h, -1), -1), 'd');
    expect(h.entries).toEqual(['a', 'd']);
  });
  it('ignores a repeat of the current view and cannot step past the ends', () => {
    let h = pushView(pushView(emptyHistory<{ x: number }>(), { x: 1 }), { x: 1 });
    expect(h.entries).toHaveLength(1);
    expect(stepHistory(h, -1)).toBe(h);
    h = pushView(h, { x: 2 });
    expect(stepHistory(h, 1)).toBe(h);
  });
  it('caps the history length', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 80; i += 1) h = pushView(h, i);
    expect(h.entries).toHaveLength(50);
    expect(h.entries[h.index]).toBe(79);
  });
});

describe('pickUnreadChannel', () => {
  const list = [{ id: 'a', unread: false }, { id: 'b', unread: true }, { id: 'c', unread: false }, { id: 'd', unread: true }];
  it('moves to the next unread and wraps', () => {
    expect(pickUnreadChannel(list, 'a', 1)).toBe('b');
    expect(pickUnreadChannel(list, 'b', 1)).toBe('d');
    expect(pickUnreadChannel(list, 'd', 1)).toBe('b');
  });
  it('moves backwards', () => {
    expect(pickUnreadChannel(list, 'd', -1)).toBe('b');
    expect(pickUnreadChannel(list, 'b', -1)).toBe('d');
    expect(pickUnreadChannel(list, null, -1)).toBe('d');
    expect(pickUnreadChannel(list, null, 1)).toBe('b');
  });
  it('returns null when nothing else is unread', () => {
    expect(pickUnreadChannel([{ id: 'a', unread: true }], 'a', 1)).toBeNull();
    expect(pickUnreadChannel([], null, 1)).toBeNull();
  });
});
