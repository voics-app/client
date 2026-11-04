import { describe, expect, it } from 'vitest';
import { firstUnreadMessageId, idBefore, unreadBar } from '@discordy/core/domain/unread';

const msgs = [
  { id: '100', authorId: 'a' },
  { id: '200', authorId: 'me' },
  { id: '300', authorId: 'b' },
  { id: '400', authorId: 'b' },
];

describe('read marker', () => {
  it('idBefore leaves the message itself unread', () => {
    expect(idBefore('300')).toBe('299');
    expect(idBefore('0')).toBe('0');
    expect(idBefore('9007199254740993')).toBe('9007199254740992');
  });

  it('finds the first unread message written by someone else', () => {
    expect(firstUnreadMessageId(msgs, '100', 'me')).toBe('300');
    expect(firstUnreadMessageId(msgs, '400', 'me')).toBeNull();
    expect(firstUnreadMessageId(msgs, null, 'me')).toBeNull();
  });

  it('summarises the backlog for the bar', () => {
    expect(unreadBar(msgs, '100', 'me', false)).toMatchObject({ count: 2, more: false });
    expect(unreadBar(msgs, '50', 'me', true)).toMatchObject({ count: 3, more: true });
    expect(unreadBar(msgs, '150', 'me', true)).toMatchObject({ count: 2, more: false });
    expect(unreadBar(msgs, null, 'me', false)).toBeNull();
  });
});
