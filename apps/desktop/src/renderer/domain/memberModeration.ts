/** Role hierarchy and member-section rules for the member list and the member context menu (P9). */
import { Permission, type PermissionName } from "@shared/contracts/permissions";
import { ChannelType, type Channel, type GuildMember, type Role } from "@shared/contracts/rest";
import { hasPermission } from "./permissions";

export interface HierarchyMember {
  userId: string;
  roleIds: readonly string[];
}

export interface MemberSection {
  title: string;
  members: GuildMember[];
}

/** Position of the member's highest role; the owner outranks everyone, and -1 means no roles. */
export function rankOf(
  member: HierarchyMember,
  ownerId: string,
  roles: readonly Role[],
): number {
  if (member.userId === ownerId) return Number.POSITIVE_INFINITY;
  let top = -1;
  for (const role of roles) {
    if (member.roleIds.includes(role.id) && role.position > top)
      top = role.position;
  }
  return top;
}

/** True when `actor` may moderate `target` (strictly higher rank, never themselves). */
export function outranks(
  actor: HierarchyMember,
  target: HierarchyMember,
  ownerId: string,
  roles: readonly Role[],
): boolean {
  if (actor.userId === target.userId) return false;
  const targetRank = rankOf(target, ownerId, roles);
  if (targetRank === Number.POSITIVE_INFINITY) return false;
  return rankOf(actor, ownerId, roles) > targetRank;
}

/** Roles the actor may hand out: below their own rank, never @everyone and never managed roles. */
export function assignableRoles(
  roles: readonly Role[],
  guildId: string,
  actorRank: number,
): Role[] {
  return roles
    .filter((r) => r.id !== guildId && !r.managed && r.position < actorRank)
    .sort((a, b) => b.position - a.position);
}

export function toggleRoleId(
  roleIds: readonly string[],
  roleId: string,
  enabled: boolean,
): string[] {
  const without = roleIds.filter((id) => id !== roleId);
  return enabled ? [...without, roleId] : without;
}

export interface MemberCapabilities {
  isSelf: boolean;
  isOwner: boolean;
  canEditNickname: boolean;
  canManageRoles: boolean;
  canServerMute: boolean;
  canServerDeafen: boolean;
  /** Move to another voice channel, or disconnect (MOVE_MEMBERS; Discord has no hierarchy check). */
  canMoveMembers: boolean;
  canTimeout: boolean;
  /** Delete the member's recent messages in bulk (MANAGE_MESSAGES; Discord has no hierarchy check). */
  canManageMessages: boolean;
  canKick: boolean;
  canBan: boolean;
}

export interface CapabilityInput {
  perms: bigint;
  ownerId: string;
  roles: readonly Role[];
  actor: HierarchyMember;
  target: HierarchyMember;
  inVoice: boolean;
}

/** What the current user may do to a member, given guild permissions and the role hierarchy. */
export function memberCapabilities({
  perms,
  ownerId,
  roles,
  actor,
  target,
  inVoice,
}: CapabilityInput): MemberCapabilities {
  const isSelf = actor.userId === target.userId;
  const isOwner = target.userId === ownerId;
  const has = (name: PermissionName) => hasPermission(perms, Permission[name]);
  const above = !isSelf && outranks(actor, target, ownerId, roles);
  return {
    isSelf,
    isOwner,
    canEditNickname: isSelf
      ? has("CHANGE_NICKNAME")
      : has("MANAGE_NICKNAMES") && above,
    canManageRoles: has("MANAGE_ROLES") && above,
    canServerMute: has("MUTE_MEMBERS") && inVoice && above,
    canServerDeafen: has("DEAFEN_MEMBERS") && inVoice && above,
    canMoveMembers: has("MOVE_MEMBERS") && inVoice && !isSelf,
    canTimeout: has("MODERATE_MEMBERS") && above,
    canManageMessages: has("MANAGE_MESSAGES") && !isSelf,
    canKick: has("KICK_MEMBERS") && above,
    canBan: has("BAN_MEMBERS") && above,
  };
}

/** Member list grouping: hoisted roles (highest first), then Online, then Offline. Each member appears once. */
export function buildMemberSections(
  members: readonly GuildMember[],
  roles: readonly Role[],
  guildId: string,
  isOnline: (userId: string) => boolean,
  nameOf: (member: GuildMember) => string,
): MemberSection[] {
  const hoisted = roles
    .filter((r) => r.hoist && r.id !== guildId)
    .sort((a, b) => b.position - a.position);
  const byName = (a: GuildMember, b: GuildMember) =>
    nameOf(a).localeCompare(nameOf(b));
  const online = members.filter((m) => isOnline(m.user.id));
  const offline = members.filter((m) => !isOnline(m.user.id)).sort(byName);
  const used = new Set<string>();
  const sections: MemberSection[] = [];
  for (const role of hoisted) {
    const list = online
      .filter((m) => !used.has(m.user.id) && m.roles.includes(role.id))
      .sort(byName);
    list.forEach((m) => used.add(m.user.id));
    if (list.length) sections.push({ title: role.name, members: list });
  }
  const rest = online.filter((m) => !used.has(m.user.id)).sort(byName);
  if (rest.length) sections.push({ title: "Online", members: rest });
  if (offline.length) sections.push({ title: "Offline", members: offline });
  return sections;
}

export const TIMEOUT_PRESETS: readonly { label: string; ms: number }[] = [
  { label: "60 seconds", ms: 60_000 },
  { label: "5 minutes", ms: 5 * 60_000 },
  { label: "10 minutes", ms: 10 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
  { label: "1 day", ms: 24 * 60 * 60_000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60_000 },
];

/** Discord caps timeouts at 28 days; the API rejects longer ones. */
export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60_000;

export function timeoutUntil(ms: number, now: number = Date.now()): string {
  return new Date(now + Math.min(ms, MAX_TIMEOUT_MS)).toISOString();
}

/** Voice and stage channels of a guild a member can be moved to, in channel order, minus where they are. */
export function moveTargets(
  channels: readonly Channel[],
  guildId: string,
  currentChannelId: string | null | undefined,
): Channel[] {
  return channels
    .filter(
      (c) =>
        c.guild_id === guildId &&
        c.id !== currentChannelId &&
        (c.type === ChannelType.GUILD_VOICE ||
          c.type === ChannelType.GUILD_STAGE_VOICE),
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
