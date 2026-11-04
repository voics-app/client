/** Discord's permission algorithm (P9), mirrored client-side to gate UI affordances. */
import { ALL_PERMISSIONS, Permission } from '../contracts/permissions';

export interface RoleGrant {
  id: string;
  permissions: string;
}

export interface OverwriteRule {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
}

export interface PermissionContext {
  guildId: string;
  ownerId: string;
  userId: string;
  memberRoleIds: readonly string[];
  roles: readonly RoleGrant[];
}

export function hasPermission(permissions: bigint, bit: bigint): boolean {
  return (permissions & bit) === bit;
}

export function parsePermissions(value: string | undefined | null): bigint {
  try {
    return value ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
}

export function computeBasePermissions(ctx: PermissionContext): bigint {
  if (ctx.userId === ctx.ownerId) return ALL_PERMISSIONS;
  const everyone = ctx.roles.find((r) => r.id === ctx.guildId);
  let permissions = parsePermissions(everyone?.permissions);
  for (const role of ctx.roles) {
    if (ctx.memberRoleIds.includes(role.id)) permissions |= parsePermissions(role.permissions);
  }
  return hasPermission(permissions, Permission.ADMINISTRATOR) ? ALL_PERMISSIONS : permissions;
}

/** Permissions that only make sense when the channel is visible. */
const CHANNEL_SCOPED_WHEN_HIDDEN = ~(
  Permission.CREATE_INSTANT_INVITE |
  Permission.MANAGE_CHANNELS |
  Permission.ADD_REACTIONS |
  Permission.PRIORITY_SPEAKER |
  Permission.STREAM |
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.SEND_TTS_MESSAGES |
  Permission.MANAGE_MESSAGES |
  Permission.EMBED_LINKS |
  Permission.ATTACH_FILES |
  Permission.READ_MESSAGE_HISTORY |
  Permission.MENTION_EVERYONE |
  Permission.USE_EXTERNAL_EMOJIS |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.MUTE_MEMBERS |
  Permission.DEAFEN_MEMBERS |
  Permission.MOVE_MEMBERS |
  Permission.USE_VAD |
  Permission.MANAGE_ROLES |
  Permission.MANAGE_WEBHOOKS |
  Permission.USE_APPLICATION_COMMANDS |
  Permission.REQUEST_TO_SPEAK |
  Permission.MANAGE_THREADS |
  Permission.CREATE_PUBLIC_THREADS |
  Permission.CREATE_PRIVATE_THREADS |
  Permission.USE_EXTERNAL_STICKERS |
  Permission.SEND_MESSAGES_IN_THREADS |
  Permission.USE_EMBEDDED_ACTIVITIES |
  Permission.USE_SOUNDBOARD |
  Permission.USE_EXTERNAL_SOUNDS |
  Permission.SEND_VOICE_MESSAGES |
  Permission.SEND_POLLS
);

export function computeChannelPermissions(ctx: PermissionContext, overwrites: readonly OverwriteRule[]): bigint {
  const base = computeBasePermissions(ctx);
  if (base === ALL_PERMISSIONS) return ALL_PERMISSIONS;

  let permissions = base;
  const everyoneOverwrite = overwrites.find((o) => o.type === 0 && o.id === ctx.guildId);
  if (everyoneOverwrite) {
    permissions &= ~parsePermissions(everyoneOverwrite.deny);
    permissions |= parsePermissions(everyoneOverwrite.allow);
  }

  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const o of overwrites) {
    if (o.type === 0 && o.id !== ctx.guildId && ctx.memberRoleIds.includes(o.id)) {
      roleDeny |= parsePermissions(o.deny);
      roleAllow |= parsePermissions(o.allow);
    }
  }
  permissions &= ~roleDeny;
  permissions |= roleAllow;

  const memberOverwrite = overwrites.find((o) => o.type === 1 && o.id === ctx.userId);
  if (memberOverwrite) {
    permissions &= ~parsePermissions(memberOverwrite.deny);
    permissions |= parsePermissions(memberOverwrite.allow);
  }

  if (!hasPermission(permissions, Permission.VIEW_CHANNEL)) permissions &= CHANNEL_SCOPED_WHEN_HIDDEN;
  return permissions;
}

/** Tri-state used by the overwrite editor: inherit (/), allow (✓) or deny (✕). */
export type OverwriteState = 'inherit' | 'allow' | 'deny';

export function overwriteStateOf(rule: Pick<OverwriteRule, 'allow' | 'deny'>, bit: bigint): OverwriteState {
  if (hasPermission(parsePermissions(rule.allow), bit)) return 'allow';
  if (hasPermission(parsePermissions(rule.deny), bit)) return 'deny';
  return 'inherit';
}

export function withOverwriteState<T extends Pick<OverwriteRule, 'allow' | 'deny'>>(
  rule: T,
  bit: bigint,
  state: OverwriteState,
): T {
  let allow = parsePermissions(rule.allow) & ~bit;
  let deny = parsePermissions(rule.deny) & ~bit;
  if (state === 'allow') allow |= bit;
  if (state === 'deny') deny |= bit;
  return { ...rule, allow: allow.toString(), deny: deny.toString() };
}

export function togglePermission(permissions: string, bit: bigint, enabled: boolean): string {
  const value = parsePermissions(permissions);
  return (enabled ? value | bit : value & ~bit).toString();
}
