/** Forwarding shared by the clients: the permissions the forward picker checks and the send itself. */
import type { ApiPort } from './ports/api';
import { useGuildStore } from './stores/guildStore';
import { useMessageStore } from './stores/messageStore';
import { useSessionStore } from './stores/sessionStore';
import { ALL_PERMISSIONS } from '../contracts/permissions';
import type { Channel, Message } from '../contracts/rest';
import { forwardBody } from '../domain/forward';
import { computeChannelPermissions } from '../domain/permissions';

/** The signed-in user's permissions in a channel (a thread uses its parent's overwrites), read from the stores now. Direct messages and unknown servers allow everything. */
export function permissionsInChannel(channel: Channel): bigint {
  const { guilds, members, channels } = useGuildStore.getState();
  const me = useSessionStore.getState().user?.id;
  const guild = channel.guild_id ? guilds[channel.guild_id] : undefined;
  if (!channel.guild_id || !guild || !me) return ALL_PERMISSIONS;
  const parent = channel.parent_id ? channels[channel.parent_id] : undefined;
  const ctx = { guildId: channel.guild_id, ownerId: guild.owner_id, userId: me, memberRoleIds: members[channel.guild_id]?.[me]?.roles ?? [], roles: guild.roles };
  return computeChannelPermissions(ctx, (parent && channel.type >= 10 && channel.type <= 12 ? parent : channel).permission_overwrites ?? []);
}

/** Forwards a message into another chat: the server snapshots it, so the copy keeps working if the original goes away. Throws when the send fails. */
export async function forwardMessage(api: Pick<ApiPort, 'sendMessage'>, message: Message, targetChannelId: string, comment: string): Promise<void> {
  const sent = await api.sendMessage(targetChannelId, forwardBody(message, comment, `fwd-${Date.now().toString(36)}`));
  useMessageStore.getState().receive(sent);
}
