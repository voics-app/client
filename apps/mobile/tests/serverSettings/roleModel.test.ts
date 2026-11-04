import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import { ALL_PERMISSIONS, Permission } from '@discordy/core/contracts/permissions';
import type { Role } from '@discordy/core/contracts/rest';
import { fromHex, roleAccess, roleEditRules, roleRows, toHex } from '../../src/serverSettings/roleModel';

const role = (id: string, position: number, extra: Partial<Role> = {}): Role => ({ id, name: id, color: 0, hoist: false, position, permissions: '0', managed: false, mentionable: false, ...extra });
const guild = { id: 'g1', owner_id: 'owner', roles: [role('g1', 0), role('admin', 3), role('mod', 2), role('regular', 1)] } as unknown as GuildMeta;
const accessFor = (userId: string, roles: string[], perms: bigint) => roleAccess({ guild, perms, userId, memberRoleIds: roles });

describe('colour helpers', () => {
  it('round-trips colours and shows no colour as grey', () => {
    expect(toHex(0xe5484d)).toBe('#e5484d');
    expect(toHex(0)).toBe('#99aab5');
    expect(fromHex('#e5484d')).toBe(0xe5484d);
    expect(fromHex('e5484d')).toBe(0xe5484d);
  });

  it('rejects anything that is not six hex digits', () => {
    expect(fromHex('#e5484')).toBeNull();
    expect(fromHex('red')).toBeNull();
  });
});

describe('roleRows', () => {
  it('lists the hierarchy top first with @everyone last, and locks roles at or above the user', () => {
    const rows = roleRows(guild, [{ roles: ['mod'] }, { roles: ['mod', 'regular'] }], accessFor('me', ['mod'], Permission.MANAGE_ROLES));
    expect(rows.map((r) => [r.role.id, r.members, r.locked])).toEqual([
      ['admin', 0, true],
      ['mod', 2, true],
      ['regular', 1, false],
      ['g1', 2, false],
    ]);
  });

  it('lets the owner change every role', () => {
    const rows = roleRows(guild, [], accessFor('owner', [], ALL_PERMISSIONS));
    expect(rows.every((r) => !r.locked)).toBe(true);
  });
});

describe('roleEditRules', () => {
  const rules = (id: string, userRoles: string[], perms: bigint, userId = 'me') => {
    const r = guild.roles.find((x) => x.id === id)!;
    return roleEditRules(r, 'g1', perms, accessFor(userId, userRoles, perms));
  };

  it('makes a role below the user editable with Manage Roles', () => {
    expect(rules('regular', ['mod'], Permission.MANAGE_ROLES).editable).toBe(true);
  });

  it('locks everything without Manage Roles or for a role above the user', () => {
    expect(rules('regular', ['mod'], 0n).editable).toBe(false);
    expect(rules('admin', ['mod'], Permission.MANAGE_ROLES).editable).toBe(false);
  });

  it('locks a permission switch the user does not hold themselves', () => {
    const r = rules('regular', ['mod'], Permission.MANAGE_ROLES | Permission.KICK_MEMBERS);
    expect(r.bitLocked(Permission.KICK_MEMBERS)).toBe(false);
    expect(r.bitLocked(Permission.BAN_MEMBERS)).toBe(true);
  });

  it('lets the owner grant any permission', () => {
    expect(rules('regular', [], ALL_PERMISSIONS, 'owner').bitLocked(Permission.BAN_MEMBERS)).toBe(false);
  });

  it('never deletes @everyone or a managed role, and hides display options for @everyone', () => {
    const managed = { ...guild, roles: [...guild.roles, role('bot', 1, { managed: true })] } as unknown as GuildMeta;
    const access = roleAccess({ guild: managed, perms: ALL_PERMISSIONS, userId: 'owner', memberRoleIds: [] });
    expect(roleEditRules(managed.roles.find((x) => x.id === 'bot')!, 'g1', ALL_PERMISSIONS, access).canDelete).toBe(false);
    const everyone = rules('g1', [], ALL_PERMISSIONS, 'owner');
    expect(everyone).toMatchObject({ canDelete: false, showDisplay: false });
    expect(rules('regular', [], ALL_PERMISSIONS, 'owner')).toMatchObject({ canDelete: true, showDisplay: true });
  });
});
