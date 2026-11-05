import { describe, expect, it } from 'vitest';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { isThread, threadBlockedReason, threadIdOf, threadNameFor, threadsOf } from '@discordy/core/domain/threads';

const thread = (id: string, parent: string, extra: Partial<Channel> = {}) => ({ id, type: ChannelType.PUBLIC_THREAD, parent_id: parent, name: `t${id}`, ...extra }) as Channel;

describe('threads', () => {
  it('knows the thread channel types', () => {
    expect(isThread({ type: ChannelType.PUBLIC_THREAD })).toBe(true);
    expect(isThread({ type: ChannelType.PRIVATE_THREAD })).toBe(true);
    expect(isThread({ type: ChannelType.ANNOUNCEMENT_THREAD })).toBe(true);
    expect(isThread({ type: ChannelType.GUILD_TEXT })).toBe(false);
    expect(isThread(undefined)).toBe(false);
  });

  it('suggests a name from the first line, at most 40 characters', () => {
    expect(threadNameFor('Plan the trip\nmore detail')).toBe('Plan the trip');
    expect(threadNameFor('x'.repeat(60))).toHaveLength(40);
    expect(threadNameFor('   ')).toBe('Thread');
    expect(threadNameFor('')).toBe('Thread');
  });

  it('finds the thread a message points to', () => {
    expect(threadIdOf({ thread: { id: 't1' }, message_reference: { channel_id: 't2' } })).toBe('t1');
    expect(threadIdOf({ message_reference: { channel_id: 't2' } })).toBe('t2');
    expect(threadIdOf({})).toBeUndefined();
  });

  it('lists the threads of one channel, active first and newest first', () => {
    const channels = Object.fromEntries(
      [thread('10', 'p'), thread('30', 'p'), thread('20', 'p', { thread_metadata: { archived: true } as never }), thread('40', 'other'), { id: '50', type: ChannelType.GUILD_TEXT, parent_id: 'p' } as Channel].map((c) => [c.id, c]),
    );
    expect(threadsOf(channels, 'p').map((c) => c.id)).toEqual(['30', '10', '20']);
  });

  it('closes the composer only for a locked thread the viewer cannot manage', () => {
    expect(threadBlockedReason({ thread_metadata: { locked: true } as never }, false)).toBe('This thread is locked.');
    expect(threadBlockedReason({ thread_metadata: { locked: true } as never }, true)).toBeNull();
    expect(threadBlockedReason({ thread_metadata: { archived: true, locked: false } as never }, false)).toBeNull();
    expect(threadBlockedReason({}, false)).toBeNull();
  });
});
