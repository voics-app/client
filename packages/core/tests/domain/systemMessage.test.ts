import { describe, expect, it } from 'vitest';
import { JOIN_GREETINGS, buildSystemMenu, buildSystemToolbar, callDuration, isSystemType, joinGreeting, joinGreetingIndex, systemSpec, type SystemInput } from '@discordy/core/domain/systemMessage';
import { idsOf } from '@discordy/core/domain/menuModel';

const base: Omit<SystemInput, 'type'> = { messageId: '1000000000000000007', authorName: 'Ann', targetName: null, content: '', timestamp: '2026-11-03T10:00:00Z' };
const spec = (over: Partial<SystemInput> & { type: number }) => systemSpec({ ...base, ...over });
const flat = (parts: { text: string }[]) => parts.map((p) => p.text).join('');
const linkActions = (parts: ReturnType<typeof spec>['parts']) => parts.flatMap((p) => (p.t === 'link' ? [p.action] : []));

describe('systemSpec by type', () => {
  it('group DM events (1, 2, 4, 5)', () => {
    expect(flat(spec({ type: 1, targetName: 'Bob' }).parts)).toBe('Ann added Bob to the group.');
    expect(flat(spec({ type: 2, targetName: 'Ann' }).parts)).toBe('Ann left the group.');
    expect(flat(spec({ type: 2, targetName: 'Bob' }).parts)).toBe('Ann removed Bob from the group.');
    expect(flat(spec({ type: 4, content: 'pals' }).parts)).toBe('Ann changed the group name to pals.');
    expect(flat(spec({ type: 5 }).parts)).toBe('Ann changed the group icon.');
  });

  it('a running call offers Join call, an ended one shows its duration', () => {
    const live = spec({ type: 3 });
    expect(live.joinCall).toBe(true);
    expect(flat(live.parts)).toBe('Ann started a call.');
    const ended = spec({ type: 3, call: { ended_timestamp: '2026-11-03T10:07:30Z' } });
    expect(ended.joinCall).toBe(false);
    expect(flat(ended.parts)).toBe('Ann started a call that lasted 7 minutes.');
  });

  it('pin links to the pins panel and to the pinned message when referenced', () => {
    expect(linkActions(spec({ type: 6, hasReference: true }).parts)).toEqual(['jump', 'pins']);
    expect(linkActions(spec({ type: 6 }).parts)).toEqual(['pins']);
  });

  it('thread created links to the thread panel', () => {
    const s = spec({ type: 18, threadName: 'Plans' });
    expect(linkActions(s.parts)).toEqual(['thread']);
    expect(flat(s.parts)).toBe('Ann started a thread: Plans.');
  });

  it('join shows a greeting with the name and the Wave button', () => {
    const s = spec({ type: 7 });
    expect(s.wave).toBe(true);
    expect(s.parts.some((p) => p.t === 'name' && p.text === 'Ann')).toBe(true);
  });

  it('unknown types show the type, never "did something"', () => {
    const s = spec({ type: 99 });
    expect(s.kind).toBe('unknown');
    expect(flat(s.parts)).toBe('Unknown system message (type 99)');
    expect(s.wave || s.joinCall).toBe(false);
  });

  it('knows every ticket type', () => {
    for (const type of [1, 2, 3, 4, 5, 6, 7, 18]) expect(spec({ type }).kind).not.toBe('unknown');
  });
});

describe('isSystemType', () => {
  it('excludes default, reply and chat input command', () => {
    expect([0, 19, 20, 21, 23].some(isSystemType)).toBe(false); // content types, incl. context menu command replies
    expect([3, 6, 7, 18, 99].every(isSystemType)).toBe(true);
  });
});

describe('join greeting', () => {
  it('is deterministic for a message id', () => {
    expect(joinGreeting('1000000000000000007')).toBe(joinGreeting('1000000000000000007'));
  });
  it('picks by id modulo the list and spreads over ids', () => {
    expect(joinGreetingIndex('10', 10)).toBe(0);
    expect(joinGreetingIndex('17', 10)).toBe(7);
    const seen = new Set(Array.from({ length: 50 }, (_, i) => joinGreetingIndex(String(1000 + i))));
    expect(seen.size).toBe(JOIN_GREETINGS.length);
  });
  it('handles non-numeric local ids', () => {
    const i = joinGreetingIndex('local-abc');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(JOIN_GREETINGS.length);
  });
  it('every greeting carries the name placeholder', () => {
    expect(JOIN_GREETINGS.every((g) => g.includes('{name}'))).toBe(true);
  });
});

describe('callDuration', () => {
  it('buckets the length', () => {
    expect(callDuration('2026-11-03T10:00:00Z', '2026-11-03T10:00:20Z')).toBe('a few seconds');
    expect(callDuration('2026-11-03T10:00:00Z', '2026-11-03T10:01:10Z')).toBe('1 minute');
    expect(callDuration('2026-11-03T10:00:00Z', '2026-11-03T12:30:00Z')).toBe('2 hours');
    expect(callDuration('2026-11-03T10:00:00Z', '2026-11-05T11:00:00Z')).toBe('2 days');
  });
});

describe('system menu and toolbar', () => {
  it('Delete only for moderators', () => {
    expect(idsOf(buildSystemMenu({ canManageMessages: false }))).not.toContain('delete');
    expect(idsOf(buildSystemMenu({ canManageMessages: true }))).toContain('delete');
  });
  it('Copy ID follows Developer mode, and is hidden when it is unset', () => {
    expect(idsOf(buildSystemMenu({ canManageMessages: false, developerMode: false }))).not.toContain('copyId');
    expect(idsOf(buildSystemMenu({ canManageMessages: false, developerMode: true }))).toContain('copyId');
    expect(idsOf(buildSystemMenu({ canManageMessages: false }))).not.toContain('copyId');
  });
  it('always offers Mark Unread', () => {
    expect(idsOf(buildSystemMenu({ canManageMessages: false, developerMode: false }))).toEqual(['markUnread']);
  });
  it('toolbar has React for reactors, Delete for moderators, always More', () => {
    expect(buildSystemToolbar({ canReact: false, canManageMessages: false, reaction: 'x' }).map((a) => a.id)).toEqual(['more']);
    expect(buildSystemToolbar({ canReact: true, canManageMessages: true, reaction: 'x' }).map((a) => a.id)).toEqual(['react', 'delete', 'more']);
  });
});
