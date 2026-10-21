import { describe, expect, it } from 'vitest';
import { ChannelType, type Channel } from '@shared/contracts/rest';
import { buildDmMenu, isClosed, systemMessageText, visibleDms } from './dmModel';
import { idsOf } from './menuModel';

const ch = (id: string, type: number, last?: string): Channel => ({ id, type, last_message_id: last ?? null }) as unknown as Channel;
// Snowflakes with increasing timestamps.
const S = (n: number) => String(BigInt(n) << 22n);

describe('visibleDms', () => {
  it('orders by latest activity and hides closed DMs until a newer message arrives', () => {
    const channels = { a: ch('a', ChannelType.DM, S(100)), b: ch('b', ChannelType.GROUP_DM, S(300)), c: ch('c', ChannelType.DM, S(200)) };
    expect(visibleDms(channels, {}).map((c) => c.id)).toEqual(['b', 'c', 'a']);
    const closed = { c: S(200) };
    expect(visibleDms(channels, closed).map((c) => c.id)).toEqual(['b', 'a']);
    expect(isClosed(closed, ch('c', ChannelType.DM, S(250)))).toBe(false);
  });
  it('treats a DM closed without messages as closed until its first message', () => {
    expect(isClosed({ x: '' }, ch('x', ChannelType.DM))).toBe(true);
    expect(isClosed({ x: '' }, ch('x', ChannelType.DM, S(5)))).toBe(false);
  });
});

describe('buildDmMenu', () => {
  it('offers leave and settings only for groups', () => {
    const group = idsOf(buildDmMenu({ group: true, hasUnread: true, muted: false, hasPeer: false }));
    expect(group).toContain('leave');
    expect(group).toContain('settings');
    const dm = idsOf(buildDmMenu({ group: false, hasUnread: false, muted: false, hasPeer: true }));
    expect(dm).toContain('profile');
    expect(dm).not.toContain('leave');
    expect(dm).toContain('close');
  });
});

describe('systemMessageText', () => {
  it('describes group changes', () => {
    expect(systemMessageText(1, 'Ann', 'Bob', '')).toBe('Ann added Bob to the group.');
    expect(systemMessageText(2, 'Ann', 'Ann', '')).toBe('Ann left the group.');
    expect(systemMessageText(2, 'Ann', 'Bob', '')).toBe('Ann removed Bob from the group.');
    expect(systemMessageText(4, 'Ann', null, 'pals')).toBe('Ann changed the group name to pals.');
    expect(systemMessageText(0, 'Ann', null, '')).toBeNull();
  });
});
