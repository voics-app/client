import { describe, expect, it } from 'vitest';
import { Permission } from '@shared/contracts';
import { RelationshipType, type Role } from '@shared/contracts/rest';
import { ALL_PERMISSIONS } from '@shared/contracts/permissions';
import { assignableRoles, memberCapabilities, type MemberCapabilities } from '@renderer/domain/memberModeration';
import {
  addableRoles,
  friendAction,
  removableRoleIds,
  roleColorCss,
  userMenuGroups,
  type UserMenuInput,
  type UserMenuItemId,
} from '@renderer/domain/userMenuModel';

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
const roles = [role(GUILD, 0), role('low', 1), role('mid', 5), role('bot', 6, { managed: true }), role('top', 10)];

const flat = (input: UserMenuInput): UserMenuItemId[] => userMenuGroups(input).flat();

function caps(
  perms: bigint,
  actorRoles: string[],
  targetRoles: string[],
  over: { actor?: string; target?: string; inVoice?: boolean } = {},
): MemberCapabilities {
  return memberCapabilities({
    perms,
    ownerId: OWNER,
    roles,
    actor: { userId: over.actor ?? 'actor', roleIds: actorRoles },
    target: { userId: over.target ?? 'target', roleIds: targetRoles },
    inVoice: over.inVoice ?? true,
  });
}

const base = (c: MemberCapabilities, over: Partial<UserMenuInput> = {}): UserMenuInput => ({
  caps: c,
  inGuild: true,
  inVoice: true,
  canMention: true,
  relationship: undefined,
  isBot: false,
  hasVoiceAudio: true,
  ...over,
});

const MOD_PERMS =
  Permission.MANAGE_ROLES |
  Permission.KICK_MEMBERS |
  Permission.BAN_MEMBERS |
  Permission.MODERATE_MEMBERS |
  Permission.MUTE_MEMBERS |
  Permission.DEAFEN_MEMBERS |
  Permission.MOVE_MEMBERS |
  Permission.MANAGE_NICKNAMES;

describe('userMenuGroups: visibility', () => {
  it('owner/admin (all permissions) sees every moderation item for a lower member in voice', () => {
    const ids = flat(base(caps(ALL_PERMISSIONS, [], ['low'], { actor: OWNER })));
    const all: UserMenuItemId[] = [
      'profile', 'mention', 'message', 'call', 'note', 'friend', 'block', 'localMute', 'volume',
      'nickname', 'roles', 'timeout', 'kick', 'ban', 'serverMute', 'serverDeafen', 'moveTo', 'disconnect', 'copyId',
    ];
    for (const id of all) expect(ids).toContain(id);
  });

  it('a plain member sees social items only, no moderation', () => {
    const ids = flat(base(caps(0n, [], ['low'])));
    expect(ids).toEqual(expect.arrayContaining(['profile', 'message', 'block', 'volume', 'copyId']));
    for (const id of ['roles', 'timeout', 'kick', 'ban', 'serverMute', 'serverDeafen', 'moveTo', 'disconnect', 'nickname'] as const) {
      expect(ids).not.toContain(id);
    }
  });

  it('each moderation item follows its own permission', () => {
    const only = (perm: bigint, id: UserMenuItemId) => {
      expect(flat(base(caps(perm, ['top'], ['low'])))).toContain(id);
      expect(flat(base(caps(0n, ['top'], ['low'])))).not.toContain(id);
    };
    only(Permission.MANAGE_ROLES, 'roles');
    only(Permission.MODERATE_MEMBERS, 'timeout');
    only(Permission.KICK_MEMBERS, 'kick');
    only(Permission.BAN_MEMBERS, 'ban');
    only(Permission.MUTE_MEMBERS, 'serverMute');
    only(Permission.DEAFEN_MEMBERS, 'serverDeafen');
    only(Permission.MOVE_MEMBERS, 'moveTo');
    only(Permission.MOVE_MEMBERS, 'disconnect');
    only(Permission.MANAGE_NICKNAMES, 'nickname');
  });

  it('role hierarchy hides moderation for a target above the actor, but not move/disconnect', () => {
    const ids = flat(base(caps(MOD_PERMS, ['mid'], ['top'])));
    for (const id of ['roles', 'timeout', 'kick', 'ban', 'serverMute', 'serverDeafen', 'nickname'] as const) {
      expect(ids).not.toContain(id);
    }
    expect(ids).toContain('moveTo');
    expect(ids).toContain('disconnect');
  });

  it('nobody can moderate the owner', () => {
    const ids = flat(base(caps(MOD_PERMS, ['top'], [], { target: OWNER })));
    for (const id of ['roles', 'timeout', 'kick', 'ban'] as const) expect(ids).not.toContain(id);
  });

  it('voice-only items need the target in voice', () => {
    const c = caps(ALL_PERMISSIONS, [], ['low'], { actor: OWNER, inVoice: false });
    const ids = flat(base(c, { inVoice: false }));
    for (const id of ['serverMute', 'serverDeafen', 'moveTo', 'disconnect', 'volume', 'localMute'] as const) {
      expect(ids).not.toContain(id);
    }
    expect(ids).toContain('kick');
  });

  it('own menu: profile, nickname (CHANGE_NICKNAME) and copy id only', () => {
    const own = caps(Permission.CHANGE_NICKNAME, ['top'], ['top'], { actor: 'me', target: 'me' });
    expect(flat(base(own))).toEqual(['profile', 'nickname', 'copyId']);
    const noNick = caps(0n, [], [], { actor: 'me', target: 'me' });
    expect(flat(base(noNick))).toEqual(['profile', 'copyId']);
  });

  it('no guild context (DM list, friends list): no moderation, no nickname', () => {
    const ids = flat(base(caps(ALL_PERMISSIONS, [], [], { actor: OWNER }), { inGuild: false, inVoice: false }));
    expect(ids).toEqual(['profile', 'mention', 'message', 'call', 'note', 'friend', 'block', 'copyId']);
  });

  it('mention only when a text channel is open; bots cannot be called, friended or blocked', () => {
    const c = caps(0n, [], []);
    expect(flat(base(c, { canMention: false }))).not.toContain('mention');
    const bot = flat(base(c, { isBot: true }));
    for (const id of ['call', 'friend', 'block'] as const) expect(bot).not.toContain(id);
  });

  it('blocked users cannot be called and cannot be friended', () => {
    const ids = flat(base(caps(0n, [], []), { relationship: RelationshipType.BLOCKED }));
    expect(ids).not.toContain('call');
    expect(ids).not.toContain('friend');
    expect(ids).toContain('block');
  });

  it('groups are non-empty and copy id is always last', () => {
    const groups = userMenuGroups(base(caps(0n, [], [])));
    expect(groups.every((g) => g.length > 0)).toBe(true);
    expect(groups.at(-1)).toEqual(['copyId']);
  });
});

describe('friendAction', () => {
  it('maps relationships to the friend item behaviour', () => {
    expect(friendAction(undefined, false, false)).toBe('add');
    expect(friendAction(RelationshipType.FRIEND, false, false)).toBe('remove');
    expect(friendAction(RelationshipType.OUTGOING, false, false)).toBe('pending');
    expect(friendAction(RelationshipType.INCOMING, false, false)).toBe('accept');
    expect(friendAction(RelationshipType.BLOCKED, false, false)).toBe('none');
    expect(friendAction(undefined, true, false)).toBe('none');
    expect(friendAction(undefined, false, true)).toBe('none');
  });
});

describe('role hierarchy filter for the roles submenu and pills', () => {
  it('only offers roles strictly below the actor, never managed or @everyone', () => {
    expect(assignableRoles(roles, GUILD, 5).map((r) => r.id)).toEqual(['low']);
    expect(assignableRoles(roles, GUILD, 10).map((r) => r.id)).toEqual(['mid', 'low']);
    expect(assignableRoles(roles, GUILD, -1)).toEqual([]);
    expect(assignableRoles(roles, GUILD, Number.POSITIVE_INFINITY).map((r) => r.id)).toEqual(['top', 'mid', 'low']);
  });

  it('pills are removable only when assignable; addable excludes roles already held', () => {
    const assignable = assignableRoles(roles, GUILD, 10);
    expect([...removableRoleIds(['low', 'top', 'bot'], assignable.map((r) => r.id))]).toEqual(['low']);
    expect(addableRoles(assignable, ['low']).map((r) => r.id)).toEqual(['mid']);
  });

  it('formats role colours, 0 meaning none', () => {
    expect(roleColorCss(0)).toBeUndefined();
    expect(roleColorCss(0x00ff00)).toBe('#00ff00');
    expect(roleColorCss(0xff)).toBe('#0000ff');
  });
});
