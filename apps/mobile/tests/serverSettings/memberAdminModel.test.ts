import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { GuildMember, Role } from '@discordy/core/contracts/rest';
import { moderationRights, moderationRows } from '../../src/serverSettings/memberAdminModel';

const role = (id: string, position: number): Role => ({ id, name: id, color: 0, hoist: false, position, permissions: '0', managed: false, mentionable: false });
const guild = { id: 'g1', owner_id: 'owner', roles: [role('g1', 0), role('mod', 2), role('regular', 1)] } as unknown as GuildMeta;
const person = (id: string, roles: string[], extra: Partial<GuildMember> = {}): GuildMember => ({ user: { id, username: id, global_name: null, avatar: null }, roles, joined_at: '2024-01-01T00:00:00Z', ...extra }) as GuildMember;
const MEMBERS = { me: person('me', ['mod']), pat: person('pat', ['regular']), boss: person('boss', ['mod']), owner: person('owner', []) };
const PERMS = Permission.KICK_MEMBERS | Permission.BAN_MEMBERS;

describe('moderationRights', () => {
  const NONE = { kick: false, ban: false, roles: false, timeout: false, nickname: false, any: false };

  it('lets a moderator kick and ban someone below their highest role', () => {
    expect(moderationRights(guild, PERMS, MEMBERS.me, 'me', MEMBERS.pat)).toEqual({ ...NONE, kick: true, ban: true, any: true });
  });

  it('never offers actions on an equal role or the owner, and on yourself only the nickname', () => {
    for (const target of [MEMBERS.boss, MEMBERS.owner]) expect(moderationRights(guild, PERMS | Permission.MANAGE_ROLES | Permission.MODERATE_MEMBERS | Permission.MANAGE_NICKNAMES, MEMBERS.me, 'me', target)).toEqual(NONE);
    expect(moderationRights(guild, PERMS, MEMBERS.me, 'me', MEMBERS.me)).toEqual(NONE);
    expect(moderationRights(guild, Permission.CHANGE_NICKNAME, MEMBERS.me, 'me', MEMBERS.me)).toEqual({ ...NONE, nickname: true, any: true });
  });

  it('offers only what the permissions allow', () => {
    expect(moderationRights(guild, Permission.KICK_MEMBERS, MEMBERS.me, 'me', MEMBERS.pat)).toEqual({ ...NONE, kick: true, any: true });
    expect(moderationRights(guild, 0n, MEMBERS.me, 'me', MEMBERS.pat)).toEqual(NONE);
  });

  it('offers roles, timeout and nicknames with their own permissions', () => {
    expect(moderationRights(guild, Permission.MANAGE_ROLES, MEMBERS.me, 'me', MEMBERS.pat)).toMatchObject({ roles: true, timeout: false, nickname: false });
    expect(moderationRights(guild, Permission.MODERATE_MEMBERS, MEMBERS.me, 'me', MEMBERS.pat)).toMatchObject({ roles: false, timeout: true, nickname: false });
    expect(moderationRights(guild, Permission.MANAGE_NICKNAMES, MEMBERS.me, 'me', MEMBERS.pat)).toMatchObject({ roles: false, timeout: false, nickname: true });
  });
});

describe('moderationRows', () => {
  it('lists members by name with their rights and filters by the search text', () => {
    const all = moderationRows(guild, PERMS, MEMBERS, 'me', '');
    expect(all.map((r) => r.name)).toEqual(['boss', 'me', 'owner', 'pat']);
    expect(moderationRows(guild, PERMS, MEMBERS, 'me', 'pa').map((r) => [r.name, r.rights.kick])).toEqual([['pat', true]]);
  });

  it('notes a timed-out member', () => {
    const timed = { ...MEMBERS, pat: person('pat', ['regular'], { communication_disabled_until: new Date(Date.now() + 60_000).toISOString() }) };
    expect(moderationRows(guild, PERMS, timed, 'me', 'pat')[0]?.subtitle).toContain('timed out');
  });
});
