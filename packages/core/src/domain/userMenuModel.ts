/** Which items the shared user context menu shows, as a pure function of permissions and relationship state. */
import { RelationshipType } from "@discordy/core/contracts/rest";
import { appsSubmenu, type ContextCommand } from "./contextCommands";
import type { MemberCapabilities } from "./memberModeration";

export type UserMenuItemId =
  | "profile"
  | "mention"
  | "message"
  | "call"
  | "note"
  | "friend"
  | "block"
  | "localMute"
  | "volume"
  | "nickname"
  | "roles"
  | "timeout"
  | "purgeMessages"
  | "kick"
  | "ban"
  | "serverMute"
  | "serverDeafen"
  | "moveTo"
  | "disconnect"
  | "apps"
  | "copyId";

export interface UserMenuInput {
  caps: MemberCapabilities;
  /** The member is in a guild the actor is viewing (menu opened with a guild context). */
  inGuild: boolean;
  /** The target is currently in a voice channel (their voice state is known). */
  inVoice: boolean;
  /** The menu was opened on a surface where a text channel can receive a mention. */
  canMention: boolean;
  relationship: number | null | undefined;
  isBot: boolean;
  /** The actor currently sits in the same call, so volume and local mute apply. */
  hasVoiceAudio: boolean;
  /** Developer mode (Settings, Advanced): shows Copy user ID. */
  developerMode?: boolean;
  /** Installed applications' USER and MESSAGE commands; USER ones fill the Apps submenu. */
  appCommands?: ContextCommand[];
}

export type FriendAction = "add" | "remove" | "pending" | "accept" | "none";

/** What the friend item does for a given relationship. */
export function friendAction(relationship: number | null | undefined, isSelf: boolean, isBot: boolean): FriendAction {
  if (isSelf || isBot) return "none";
  switch (relationship) {
    case RelationshipType.FRIEND:
      return "remove";
    case RelationshipType.OUTGOING:
      return "pending";
    case RelationshipType.INCOMING:
      return "accept";
    case RelationshipType.BLOCKED:
      return "none";
    default:
      return "add";
  }
}

/** Ordered groups of visible items; empty groups are dropped. Separators go between groups. */
export function userMenuGroups(input: UserMenuInput): UserMenuItemId[][] {
  const { caps, inGuild, inVoice, canMention, relationship, isBot, hasVoiceAudio } = input;
  const self = caps.isSelf;
  const blocked = relationship === RelationshipType.BLOCKED;
  const social: UserMenuItemId[] = [
    "profile",
    ...(!self && canMention ? (["mention"] as const) : []),
    ...(!self ? (["message"] as const) : []),
    ...(!self && !isBot && !blocked ? (["call"] as const) : []),
    ...(!self ? (["note"] as const) : []),
    ...(friendAction(relationship, self, isBot) !== "none" ? (["friend"] as const) : []),
    ...(!self && !isBot ? (["block"] as const) : []),
  ];
  const audio: UserMenuItemId[] = !self && inVoice && hasVoiceAudio ? ["localMute", "volume"] : [];
  const manage: UserMenuItemId[] = [
    ...(inGuild && caps.canEditNickname ? (["nickname"] as const) : []),
    ...(inGuild && caps.canManageRoles ? (["roles"] as const) : []),
    ...(inGuild && caps.canServerMute ? (["serverMute"] as const) : []),
    ...(inGuild && caps.canServerDeafen ? (["serverDeafen"] as const) : []),
    ...(inGuild && caps.canMoveMembers ? (["moveTo", "disconnect"] as const) : []),
    ...(inGuild && caps.canTimeout ? (["timeout"] as const) : []),
  ];
  const danger: UserMenuItemId[] = [
    ...(inGuild && caps.canManageMessages ? (["purgeMessages"] as const) : []),
    ...(inGuild && caps.canKick ? (["kick"] as const) : []),
    ...(inGuild && caps.canBan ? (["ban"] as const) : []),
  ];
  const apps: UserMenuItemId[] = appsSubmenu(input.appCommands, "user") ? ["apps"] : [];
  const groups: UserMenuItemId[][] = [social, audio, manage, danger, apps, input.developerMode ? ["copyId"] : []];
  return groups.filter((g) => g.length > 0);
}

/** Roles shown as removable pills: only those the actor may hand out (hierarchy, not managed, not @everyone). */
export function removableRoleIds(memberRoleIds: readonly string[], assignableIds: readonly string[]): Set<string> {
  const allowed = new Set(assignableIds);
  return new Set(memberRoleIds.filter((id) => allowed.has(id)));
}

/** Roles that could still be added to a member. */
export function addableRoles<T extends { id: string }>(assignable: readonly T[], memberRoleIds: readonly string[]): T[] {
  return assignable.filter((r) => !memberRoleIds.includes(r.id));
}

/** Parse a role colour int as a CSS colour; 0 means "no colour". */
export function roleColorCss(color: number): string | undefined {
  return color ? `#${color.toString(16).padStart(6, "0")}` : undefined;
}

/** Discord's ban "delete message history" choices; the API caps the window at 7 days. */
export const BAN_HISTORY_OPTIONS: readonly { label: string; seconds: number }[] = [
  { label: "Don't delete any", seconds: 0 },
  { label: 'Previous hour', seconds: 3600 },
  { label: 'Previous 6 hours', seconds: 6 * 3600 },
  { label: 'Previous 12 hours', seconds: 12 * 3600 },
  { label: 'Previous 24 hours', seconds: 24 * 3600 },
  { label: 'Previous 3 days', seconds: 3 * 86400 },
  { label: 'Previous 7 days', seconds: 7 * 86400 },
];
