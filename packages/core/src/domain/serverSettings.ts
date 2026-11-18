/** Which server settings pages and entry points a member may use, from their guild permissions. */
import { Permission } from '../contracts/permissions';
import { hasPermission } from './permissions';

export type ServerSettingsTabId = 'overview' | 'roles' | 'emoji' | 'members' | 'invites' | 'template' | 'discovery' | 'bans' | 'audit';

export interface ServerSettingsTabEntry {
  id: ServerSettingsTabId;
  label: string;
  show: boolean;
}

export function serverSettingsTabs(perms: bigint): ServerSettingsTabEntry[] {
  const can = (bit: bigint) => hasPermission(perms, bit);
  return [
    { id: 'overview', label: 'Overview', show: can(Permission.MANAGE_GUILD) },
    { id: 'roles', label: 'Roles', show: can(Permission.MANAGE_ROLES) },
    { id: 'emoji', label: 'Emoji', show: can(Permission.MANAGE_GUILD_EXPRESSIONS) },
    { id: 'members', label: 'Members', show: true },
    { id: 'invites', label: 'Invites', show: can(Permission.MANAGE_GUILD) },
    { id: 'template', label: 'Template', show: can(Permission.MANAGE_GUILD) },
    { id: 'discovery', label: 'Discovery', show: can(Permission.MANAGE_GUILD) },
    { id: 'bans', label: 'Bans', show: can(Permission.BAN_MEMBERS) },
    { id: 'audit', label: 'Audit log', show: can(Permission.VIEW_AUDIT_LOG) },
  ];
}

/** Settings remain reachable for audit readers as well as server managers. */
export function canOpenServerSettings(perms: bigint): boolean {
  return hasPermission(perms, Permission.MANAGE_GUILD) || hasPermission(perms, Permission.MANAGE_ROLES) || hasPermission(perms, Permission.MANAGE_CHANNELS) || hasPermission(perms, Permission.VIEW_AUDIT_LOG);
}
