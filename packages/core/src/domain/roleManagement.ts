/** Role list rules for Server Settings > Roles: hierarchy locks, drag reorder, counts and bulk positions. */
import { Permission } from '../contracts/permissions';
import type { Role } from '../contracts/rest';
import { hasPermission, parsePermissions } from './permissions';

export interface RolePosition {
  id: string;
  position: number;
}

/** Roles ordered top of the hierarchy first, without @everyone. */
export function hierarchyList(roles: readonly Role[], guildId: string): Role[] {
  return roles.filter((r) => r.id !== guildId).sort((a, b) => b.position - a.position);
}

/** The owner manages every role; others only roles strictly below their highest one. Managed roles can be edited but never assigned. */
export function canManageRole(role: Role, guildId: string, actorRank: number, isOwner: boolean): boolean {
  if (role.id === guildId) return isOwner || actorRank >= 0;
  return isOwner || role.position < actorRank;
}

/** Roles the actor may drag: only those below their own highest role (everything for the owner). */
export function isMovable(role: Role, actorRank: number, isOwner: boolean): boolean {
  return isOwner || role.position < actorRank;
}

/**
 * Moves `roleId` to `toIndex` in the top-first `list` and returns the positions that changed.
 * The slots (position numbers) held by movable roles are reused, so locked roles never move and no
 * role ever lands at or above the actor's own rank. Returns [] when the move is not allowed or a no-op.
 */
export function reorderPositions(list: readonly Role[], roleId: string, toIndex: number, actorRank: number, isOwner: boolean): RolePosition[] {
  const from = list.findIndex((r) => r.id === roleId);
  if (from < 0 || !isMovable(list[from]!, actorRank, isOwner)) return [];
  const firstMovable = list.findIndex((r) => isMovable(r, actorRank, isOwner));
  const target = Math.max(firstMovable, Math.min(toIndex, list.length - 1));
  if (target === from) return [];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved!);
  const slots = list.slice(firstMovable).map((r) => r.position);
  const changes: RolePosition[] = [];
  next.slice(firstMovable).forEach((role, i) => {
    if (role.position !== slots[i]) changes.push({ id: role.id, position: slots[i]! });
  });
  return changes;
}

/** Applies bulk position changes to a role list (optimistic update and server echo). */
export function applyPositions(roles: readonly Role[], changes: readonly RolePosition[]): Role[] {
  const byId = new Map(changes.map((c) => [c.id, c.position]));
  return roles.map((r) => (byId.has(r.id) ? { ...r, position: byId.get(r.id)! } : r));
}

/** Members per role; @everyone counts every member. */
export function memberCounts(members: readonly { roles: readonly string[] }[], guildId: string): Record<string, number> {
  const counts: Record<string, number> = { [guildId]: members.length };
  for (const m of members) for (const id of m.roles) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

export function isAdministrator(permissions: string): boolean {
  return hasPermission(parsePermissions(permissions), Permission.ADMINISTRATOR);
}

/** "Clear permissions": every permission off. */
export const CLEARED_PERMISSIONS = '0';

/** Permissions the actor may hand out through a role (the api rejects anything they lack unless owner or administrator). */
export function grantableBits(actorPerms: bigint, isOwner: boolean): bigint | 'all' {
  return isOwner || hasPermission(actorPerms, Permission.ADMINISTRATOR) ? 'all' : actorPerms;
}
