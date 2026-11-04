import { describe, expect, it } from 'vitest';
import type { GuildMember } from '@discordy/core/contracts/rest';
import { activityLine, flattenSections, searchMembers } from '@discordy/core/domain/memberList';

const m = (id: string, extra: Partial<GuildMember['user']> = {}, nick?: string): GuildMember =>
  ({ user: { id, username: id, ...extra }, roles: [], nick }) as unknown as GuildMember;
const nameOf = (x: GuildMember): string => x.nick ?? x.user.global_name ?? x.user.username;

describe('flattenSections', () => {
  const sections = [
    { id: 'r1', title: 'Admins', members: [m('a'), m('b')] },
    { id: 'offline', title: 'Offline', members: [m('c')] },
  ];
  it('emits headers with counts and members', () => {
    const rows = flattenSections(sections, new Set());
    expect(rows.map((r) => r.kind)).toEqual(['header', 'member', 'member', 'header', 'member']);
    expect(rows[0]).toMatchObject({ title: 'Admins', count: 2, collapsed: false });
  });
  it('hides members of collapsed groups but keeps the count', () => {
    const rows = flattenSections(sections, new Set(['r1']));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ count: 2, collapsed: true });
  });
});

describe('searchMembers', () => {
  const list = [m('zed', {}, 'Bob'), m('bobby'), m('alice', { global_name: 'Al' }), m('carol')];
  it('matches nick, username and global name, prefix matches first', () => {
    expect(searchMembers(list, 'bo', nameOf).map((x) => x.user.id)).toEqual(['zed', 'bobby']);
    expect(searchMembers(list, 'AL', nameOf).map((x) => x.user.id)).toEqual(['alice']);
    expect(searchMembers(list, 'ro', nameOf).map((x) => x.user.id)).toEqual(['carol']);
  });
  it('returns nothing for an empty query', () => {
    expect(searchMembers(list, '  ', nameOf)).toEqual([]);
  });
});

describe('activityLine', () => {
  it('shows a game over a custom status', () => {
    expect(activityLine([{ name: 'Custom Status', type: 4, state: 'brb' }, { name: 'Factorio', type: 0 }])).toBe('Playing Factorio');
  });
  it('shows the custom status text with its emoji', () => {
    expect(activityLine([{ name: 'Custom Status', type: 4, state: 'brb', emoji: { name: 'pizza' } }])).toBe('pizza brb');
  });
  it('is null with no activity', () => {
    expect(activityLine([])).toBeNull();
  });
});
