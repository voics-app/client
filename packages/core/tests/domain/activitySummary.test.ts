import { describe, expect, it } from 'vitest';
import { summarizeActivity } from '@discordy/core/domain/unread';

describe('summarizeActivity', () => {
  const channels = [
    { id: 'a', last_message_id: '20' },
    { id: 'b', last_message_id: '30' },
    { id: 'c', last_message_id: '40' },
    { id: 'd', last_message_id: null },
  ];
  it('counts unread unmuted channels and sums mentions', () => {
    const reads = { a: { lastReadId: '20', mentionCount: 0 }, b: { lastReadId: '10', mentionCount: 2 }, c: { lastReadId: null, mentionCount: 1 } };
    expect(summarizeActivity(channels, reads, {})).toEqual({ mentions: 3, unread: 2 });
  });
  it('ignores muted channels for unread but keeps their mentions', () => {
    const reads = { b: { lastReadId: '10', mentionCount: 2 } };
    expect(summarizeActivity(channels, reads, { b: true, c: true })).toEqual({ mentions: 2, unread: 1 });
  });
});
