/** Which server settings pages and entry points a member may use, from their guild permissions. */
import { Permission } from '../contracts/permissions';
import { hasPermission } from './permissions';

export type ServerSettingsTabId = 'overview' | 'roles' | 'emoji' | 'members' | 'invites' | 'template' | 'discovery' | 'bans' | 'audit' | 'integrations';

export interface ServerSettingsTabEntry {
  id: ServerSettingsTabId;
  label: string;
  show: boolean;
  group: 'Server' | 'People' | 'Moderation';
}

export function serverSettingsTabs(perms: bigint): ServerSettingsTabEntry[] {
  const can = (bit: bigint) => hasPermission(perms, bit);
  return [
    { id: 'overview', label: 'Overview', group: 'Server', show: can(Permission.MANAGE_GUILD) },
    { id: 'roles', label: 'Roles', group: 'Server', show: can(Permission.MANAGE_ROLES) },
    { id: 'emoji', label: 'Emoji', group: 'Server', show: can(Permission.MANAGE_GUILD_EXPRESSIONS) },
    { id: 'members', label: 'Members', group: 'People', show: true },
    { id: 'invites', label: 'Invites', group: 'People', show: can(Permission.MANAGE_GUILD) },
    { id: 'template', label: 'Template', group: 'Server', show: can(Permission.MANAGE_GUILD) },
    { id: 'discovery', label: 'Discovery', group: 'Server', show: can(Permission.MANAGE_GUILD) },
    { id: 'integrations', label: 'Integrations', group: 'Server', show: can(Permission.MANAGE_GUILD) || can(Permission.MANAGE_WEBHOOKS) },
    { id: 'bans', label: 'Bans', group: 'Moderation', show: can(Permission.BAN_MEMBERS) || can(Permission.MANAGE_BAN_APPEALS) },
    { id: 'audit', label: 'Audit log', group: 'Moderation', show: can(Permission.VIEW_AUDIT_LOG) },
  ];
}

/** Settings remain reachable for audit readers as well as server managers. */
export function canOpenServerSettings(perms: bigint): boolean {
  return hasPermission(perms, Permission.MANAGE_BAN_APPEALS) || hasPermission(perms, Permission.MANAGE_GUILD) || hasPermission(perms, Permission.MANAGE_ROLES) || hasPermission(perms, Permission.MANAGE_CHANNELS) || hasPermission(perms, Permission.VIEW_AUDIT_LOG) || hasPermission(perms, Permission.MANAGE_WEBHOOKS);
}
