import { Permission } from '@discordy/core/contracts/permissions';
import { hasPermission } from '@discordy/core/domain/permissions';
import { canOpenServerSettings } from '@discordy/core/domain/serverSettings';

export interface ServerMenuEntries {
  /** Create an invite: needs Create Invite and a text channel to invite through. */
  invite: boolean;
  settings: boolean;
  /** The owner cannot leave their own server. */
  leave: boolean;
  /** Only the owner may delete the server. */
  delete: boolean;
}

/** Which entries the server menu offers, from the same permission checks as desktop's GuildMenu. */
export function serverMenuEntries(perms: bigint, isOwner: boolean, hasInviteChannel: boolean): ServerMenuEntries {
  return {
    invite: hasPermission(perms, Permission.CREATE_INSTANT_INVITE) && hasInviteChannel,
    settings: canOpenServerSettings(perms & ~Permission.MANAGE_BAN_APPEALS),
    leave: !isOwner,
    delete: isOwner,
  };
}

/** Deleting a server needs its name typed back, ignoring case and surrounding space. */
export function canDeleteWithName(typed: string, name: string): boolean {
  return name.trim() !== '' && typed.trim().toLowerCase() === name.trim().toLowerCase();
}
