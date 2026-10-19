import { describe, expect, it } from 'vitest';
import { Permission } from '@shared/contracts';
import type { Channel, GuildMember, Role } from '@shared/contracts/rest';
import {
  assignableRoles,
  buildMemberSections,
  memberCapabilities,
  moveTargets,
  outranks,
  rankOf,
  timeoutUntil,
  toggleRoleId,
  MAX_TIMEOUT_MS,
} from '@renderer/domain/memberModeration';

const GUILD = 'g1';
const OWNER = 'owner';

const role = (id: string, position: number, extra: Partial<Role> = {}): Role => ({
  id,
  name: id,
  color: 0,
  hoist: false,
  position,
  permissions: '0',
  managed: false,
  mentionable: false,
  ...extra,
});

const roles: Role[] = [
  role(GUILD, 0),
  role('r-helper', 1, { hoist: true, name: 'Helpers' }),
  role('r-mod', 5, { hoist: true, name: 'Moderators', color: 0x00ff00 }),
  role('r-bot', 6, { managed: true }),
  role('r-admin', 10, { hoist: true, name: 'Admins' }),
];

const member = (id: string, roleIds: string[], extra: Partial<GuildMember> = {}): GuildMember => ({
  user: { id, username: id } as GuildMember['user'],
  roles: roleIds,
  joined_at: '2026-01-01T00:00:00Z',
  deaf: false,
  mute: false,
  ...extra,
});

describe('rankOf / outranks', () => {
  it('ranks by highest role, the owner above everyone, no roles at -1', () => {
    expect(rankOf({ userId: 'a', roleIds: ['r-mod', 'r-helper'] }, OWNER, roles)).toBe(5);
    expect(rankOf({ userId: 'a', roleIds: [] }, OWNER, roles)).toBe(-1);
    expect(rankOf({ userId: OWNER, roleIds: [] }, OWNER, roles)).toBe(Number.POSITIVE_INFINITY);
  });

  it('lets a higher role moderate a lower one, never an equal or higher one', () => {
    const admin = { userId: 'adm', roleIds: ['r-admin'] };
    const mod = { userId: 'mod', roleIds: ['r-mod'] };
    const other = { userId: 'x', roleIds: ['r-mod'] };
    expect(outranks(admin, mod, OWNER, roles)).toBe(true);
    expect(outranks(mod, admin, OWNER, roles)).toBe(false);
    expect(outranks(mod, other, OWNER, roles)).toBe(false);
  });

  it('never lets anyone moderate the owner or themselves', () => {
    const owner = { userId: OWNER, roleIds: [] };
    expect(outranks({ userId: 'adm', roleIds: ['r-admin'] }, owner, OWNER, roles)).toBe(false);
    expect(outranks(owner, owner, OWNER, roles)).toBe(false);
    expect(outranks(owner, { userId: 'adm', roleIds: ['r-admin'] }, OWNER, roles)).toBe(true);
  });
});

describe('assignableRoles', () => {
  it('excludes @everyone, managed roles and roles at or above the actor', () => {
    const ids = assignableRoles(roles, GUILD, 5).map((r) => r.id);
    expect(ids).toEqual(['r-helper']);
  });

  it('returns roles highest first', () => {
    const ids = assignableRoles(roles, GUILD, Number.POSITIVE_INFINITY).map((r) => r.id);
    expect(ids).toEqual(['r-admin', 'r-mod', 'r-helper']);
  });
});

describe('toggleRoleId', () => {
  it('adds and removes a role id without duplicates', () => {
    expect(toggleRoleId(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleRoleId(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleRoleId(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});

describe('memberCapabilities', () => {
  const base = { perms: 0n, ownerId: OWNER, roles, inVoice: false };
  const admin = { userId: 'adm', roleIds: ['r-admin'] };
  const target = { userId: 'u1', roleIds: ['r-helper'] };

  it('grants nothing without permissions', () => {
    const caps = memberCapabilities({ ...base, actor: admin, target });
    expect(caps).toMatchObject({ canManageRoles: false, canTimeout: false, canKick: false, canBan: false, canServerMute: false });
  });

  it('grants moderation to a higher-ranked actor holding the permission', () => {
    const perms = BigInt(Permission.MANAGE_ROLES | Permission.MODERATE_MEMBERS | Permission.KICK_MEMBERS | Permission.BAN_MEMBERS);
    const caps = memberCapabilities({ ...base, perms, actor: admin, target });
    expect(caps).toMatchObject({ canManageRoles: true, canTimeout: true, canKick: true, canBan: true, isSelf: false });
  });

  it('denies moderation of a higher or equal target even with permissions', () => {
    const perms = BigInt(Permission.MANAGE_ROLES | Permission.KICK_MEMBERS);
    const higher = memberCapabilities({ ...base, perms, actor: { userId: 'mod', roleIds: ['r-mod'] }, target: admin });
    expect(higher.canKick).toBe(false);
    expect(higher.canManageRoles).toBe(false);
  });

  it('allows server mute and deafen only for members in voice', () => {
    const perms = BigInt(Permission.MUTE_MEMBERS | Permission.DEAFEN_MEMBERS);
    expect(memberCapabilities({ ...base, perms, actor: admin, target, inVoice: true })).toMatchObject({ canServerMute: true, canServerDeafen: true });
    expect(memberCapabilities({ ...base, perms, actor: admin, target, inVoice: false })).toMatchObject({ canServerMute: false, canServerDeafen: false });
  });

  it('allows moving and disconnecting only for members in voice, without a hierarchy check', () => {
    const perms = BigInt(Permission.MOVE_MEMBERS);
    const mod = { userId: 'mod', roleIds: ['r-mod'] };
    expect(memberCapabilities({ ...base, perms, actor: mod, target: admin, inVoice: true }).canMoveMembers).toBe(true);
    expect(memberCapabilities({ ...base, perms, actor: mod, target: admin, inVoice: false }).canMoveMembers).toBe(false);
    expect(memberCapabilities({ ...base, perms: 0n, actor: admin, target, inVoice: true }).canMoveMembers).toBe(false);
    expect(memberCapabilities({ ...base, perms, actor: target, target, inVoice: true }).canMoveMembers).toBe(false);
  });

  it('lets anyone edit their own nickname with CHANGE_NICKNAME, and not roles of themselves', () => {
    const self = memberCapabilities({ ...base, perms: BigInt(Permission.CHANGE_NICKNAME | Permission.MANAGE_ROLES), actor: target, target });
    expect(self).toMatchObject({ isSelf: true, canEditNickname: true, canManageRoles: false, canKick: false });
  });

  it('requires MANAGE_NICKNAMES and rank to change someone else nickname', () => {
    const perms = BigInt(Permission.MANAGE_NICKNAMES);
    expect(memberCapabilities({ ...base, perms, actor: admin, target }).canEditNickname).toBe(true);
    expect(memberCapabilities({ ...base, perms, actor: target, target: admin }).canEditNickname).toBe(false);
  });

  it('never allows acting on the owner', () => {
    const perms = BigInt(Permission.KICK_MEMBERS | Permission.BAN_MEMBERS | Permission.MODERATE_MEMBERS);
    const caps = memberCapabilities({ ...base, perms, actor: admin, target: { userId: OWNER, roleIds: [] } });
    expect(caps).toMatchObject({ isOwner: true, canKick: false, canBan: false, canTimeout: false });
  });
});

describe('buildMemberSections', () => {
  const name = (m: GuildMember) => m.user.username;
  const members = [
    member('zed', ['r-admin']),
    member('amy', ['r-mod', 'r-helper']),
    member('bob', ['r-helper']),
    member('cat', []),
    member('dan', ['r-mod'], { user: { id: 'dan', username: 'dan' } as GuildMember['user'] }),
    member('eve', []),
  ];
  const online = new Set(['zed', 'amy', 'bob', 'cat']);

  it('groups online members under their highest hoisted role, then Online, then Offline', () => {
    const sections = buildMemberSections(members, roles, GUILD, (id) => online.has(id), name);
    expect(sections.map((s) => s.title)).toEqual(['Admins', 'Moderators', 'Helpers', 'Online', 'Offline']);
    expect(sections[0]!.members.map((m) => m.user.id)).toEqual(['zed']);
    expect(sections[1]!.members.map((m) => m.user.id)).toEqual(['amy']);
    expect(sections[2]!.members.map((m) => m.user.id)).toEqual(['bob']);
    expect(sections[3]!.members.map((m) => m.user.id)).toEqual(['cat']);
    expect(sections[4]!.members.map((m) => m.user.id)).toEqual(['dan', 'eve']);
  });

  it('lists each member once and drops empty sections', () => {
    const sections = buildMemberSections(members, roles, GUILD, () => true, name);
    const ids = sections.flatMap((s) => s.members.map((m) => m.user.id));
    expect(ids.sort()).toEqual(['amy', 'bob', 'cat', 'dan', 'eve', 'zed']);
    expect(sections.every((s) => s.members.length > 0)).toBe(true);
    expect(sections.map((s) => s.title)).not.toContain('Offline');
  });
});

describe('timeoutUntil', () => {
  it('returns an ISO timestamp offset from now and caps at 28 days', () => {
    const now = Date.parse('2026-10-19T00:00:00Z');
    expect(timeoutUntil(60_000, now)).toBe('2026-10-19T00:01:00.000Z');
    expect(timeoutUntil(MAX_TIMEOUT_MS * 2, now)).toBe(new Date(now + MAX_TIMEOUT_MS).toISOString());
  });
});

describe('moveTargets', () => {
  const channel = (id: string, type: number, position: number, guild = GUILD) =>
    ({ id, type, position, guild_id: guild, name: id }) as unknown as Channel;
  const channels = [
    channel('text', 0, 0),
    channel('v2', 2, 2),
    channel('v1', 2, 1),
    channel('stage', 13, 3),
    channel('elsewhere', 2, 0, 'g2'),
    channel('category', 4, 0),
  ];

  it('lists the guild voice and stage channels in order, minus the current one', () => {
    expect(moveTargets(channels, GUILD, 'v1').map((c) => c.id)).toEqual(['v2', 'stage']);
    expect(moveTargets(channels, GUILD, null).map((c) => c.id)).toEqual(['v1', 'v2', 'stage']);
  });
});
