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
  it('lets a moderator kick and ban someone below their highest role', () => {
    expect(moderationRights(guild, PERMS, MEMBERS.me, 'me', MEMBERS.pat)).toEqual({ kick: true, ban: true });
  });

  it('never offers actions on yourself, an equal role or the owner', () => {
    for (const target of [MEMBERS.me, MEMBERS.boss, MEMBERS.owner]) {
      expect(moderationRights(guild, PERMS, MEMBERS.me, 'me', target)).toEqual({ kick: false, ban: false });
    }
  });

  it('offers only what the permissions allow', () => {
    expect(moderationRights(guild, Permission.KICK_MEMBERS, MEMBERS.me, 'me', MEMBERS.pat)).toEqual({ kick: true, ban: false });
    expect(moderationRights(guild, 0n, MEMBERS.me, 'me', MEMBERS.pat)).toEqual({ kick: false, ban: false });
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
