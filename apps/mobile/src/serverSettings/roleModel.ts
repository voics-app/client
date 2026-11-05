import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Role } from '@discordy/core/contracts/rest';
import { rankOf } from '@discordy/core/domain/memberModeration';
import { hasPermission, parsePermissions } from '@discordy/core/domain/permissions';
import { canManageRole, grantableBits, hierarchyList, memberCounts } from '@discordy/core/domain/roleManagement';

export const SWATCHES = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f', '#99aab5'] as const;
const NO_COLOR = '#99aab5';

export const toHex = (color: number): string => (color ? `#${color.toString(16).padStart(6, '0')}` : NO_COLOR);

/** A `#rrggbb` string as the integer the api stores, or null when it is not a colour. */
export function fromHex(hex: string): number | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? parseInt(m[1]!, 16) : null;
}

export interface RoleRow {
  role: Role;
  members: number;
  /** The role is at or above the user's highest, so it can be seen but not changed. */
  locked: boolean;
}

export interface RoleAccessInput {
  guild: GuildMeta;
  perms: bigint;
  userId: string;
  memberRoleIds: readonly string[];
}

export interface RoleAccess {
  canCreate: boolean;
  /** The user's rank, for the same hierarchy rule the desktop applies. */
  actorRank: number;
  isOwner: boolean;
}

export function roleAccess({ guild, perms, userId, memberRoleIds }: RoleAccessInput): RoleAccess {
  return {
    canCreate: hasPermission(perms, Permission.MANAGE_ROLES),
    actorRank: rankOf({ userId, roleIds: memberRoleIds }, guild.owner_id, guild.roles),
    isOwner: userId === guild.owner_id,
  };
}

/** The role list, highest first, with member counts and which roles the user may not touch. @everyone comes last. */
export function roleRows(guild: GuildMeta, members: readonly { roles: readonly string[] }[], access: RoleAccess): RoleRow[] {
  const counts = memberCounts(members, guild.id);
  const everyone = guild.roles.find((r) => r.id === guild.id);
  return [...hierarchyList(guild.roles, guild.id), ...(everyone ? [everyone] : [])].map((role) => ({
    role,
    members: counts[role.id] ?? 0,
    locked: !canManageRole(role, guild.id, access.actorRank, access.isOwner),
  }));
}

export interface RoleEditRules {
  /** The user may change this role at all. */
  editable: boolean;
  /** A permission switch is disabled when the user cannot grant that bit and the role does not already have it. */
  bitLocked(bit: bigint): boolean;
  /** Display options (colour, separate display, mention) and delete do not apply to @everyone; managed roles cannot be deleted. */
  canDelete: boolean;
  showDisplay: boolean;
}

export function roleEditRules(role: Role, guildId: string, perms: bigint, access: RoleAccess): RoleEditRules {
  const editable = access.canCreate && canManageRole(role, guildId, access.actorRank, access.isOwner);
  const grantable = grantableBits(perms, access.isOwner);
  const current = parsePermissions(role.permissions);
  return {
    editable,
    bitLocked: (bit) => !editable || (grantable !== 'all' && !hasPermission(grantable, bit) && !hasPermission(current, bit)),
    canDelete: editable && !role.managed && role.id !== guildId,
    showDisplay: role.id !== guildId,
  };
}
