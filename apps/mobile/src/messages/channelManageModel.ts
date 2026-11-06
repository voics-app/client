import { Permission } from '@discordy/core/contracts/permissions';
import type { Channel } from '@discordy/core/contracts/rest';
import { hasPermission } from '@discordy/core/domain/permissions';
import { isThread } from '@discordy/core/domain/threads';

export interface ChannelManageEntries {
  guildId: string | null;
  /** Edit channel: a server channel (not a thread, not a category) for someone with Manage Channels, as the desktop channel menu shows it. */
  edit: boolean;
  delete: boolean;
}

/** What the channel menu offers for managing the channel itself. */
export function channelManageEntries(channel: Channel | undefined, perms: bigint): ChannelManageEntries {
  const manageable = Boolean(channel?.guild_id) && channel !== undefined && !isThread(channel) && hasPermission(perms, Permission.MANAGE_CHANNELS);
  return { guildId: channel?.guild_id ?? null, edit: manageable, delete: manageable };
}
