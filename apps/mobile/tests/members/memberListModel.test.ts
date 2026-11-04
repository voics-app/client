import type { GuildMember, Role } from '@discordy/core/contracts/rest';
import { activityText, memberName, memberRows, roleColor } from '../../src/members/memberListModel';

const role = (id: string, extra: Partial<Role> = {}): Role => ({ id, name: id, color: 0, hoist: false, position: 0, permissions: '0', managed: false, mentionable: false, ...extra });
const person = (id: string, extra: Partial<GuildMember> = {}): GuildMember => ({ user: { id, username: id, global_name: null, avatar: null }, roles: [], joined_at: '2024-01-01T00:00:00Z', ...extra }) as GuildMember;
const ROLES = [role('g1'), role('mods', { name: 'Mods', hoist: true, position: 2, color: 0xe5484d })];
const MEMBERS = { a: person('a', { roles: ['mods'] }), b: person('b'), c: person('c') };
const input = { members: MEMBERS, roles: ROLES, guildId: 'g1', presence: { a: { status: 'online', activities: [] }, b: { status: 'idle', activities: [] } } as never, collapsed: new Set<string>(), query: '' };

describe('memberRows', () => {
  it('groups by hoisted role, then online, then offline, with counts', () => {
    const rows = memberRows(input);
    expect(rows.map((r) => (r.kind === 'header' ? `${r.title}:${r.count}` : r.member.user.id))).toEqual(['Mods:1', 'a', 'Online:1', 'b', 'Offline:1', 'c']);
  });

  it('hides the members of a collapsed group', () => {
    const rows = memberRows({ ...input, collapsed: new Set(['offline']) });
    expect(rows.map((r) => r.key)).toEqual(['h:mods', 'm:mods:a', 'h:online', 'm:online:b', 'h:offline']);
  });

  it('shows search results instead of groups', () => {
    const rows = memberRows({ ...input, query: 'c' });
    expect(rows.map((r) => (r.kind === 'header' ? r.title : r.member.user.id))).toEqual(['Search results', 'c']);
  });

  it('is empty without loaded members', () => {
    expect(memberRows({ ...input, members: undefined })).toEqual([]);
  });
});

describe('member names and colours', () => {
  it('names a member by nickname, global name or username', () => {
    expect(memberName(person('a', { nick: 'Ace' }))).toBe('Ace');
    expect(memberName(person('a', { user: { id: 'a', username: 'a', global_name: 'Alpha', avatar: null } }))).toBe('Alpha');
    expect(memberName(person('a'))).toBe('a');
  });

  it('colours a name by the highest coloured role', () => {
    expect(roleColor(ROLES, MEMBERS.a)).toBe('#e5484d');
    expect(roleColor(ROLES, MEMBERS.b)).toBeUndefined();
  });

  it('words an activity', () => {
    expect(activityText([{ name: 'Chess', type: 0 }])).toBe('Playing Chess');
    expect(activityText(undefined)).toBe('');
  });
});
