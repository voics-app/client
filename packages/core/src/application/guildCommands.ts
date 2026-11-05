/** Server commands shared by the clients: marking read, saving the server rail, leaving and deleting a server. */
import type { ApiPort } from './ports/api';
import { useGuildStore } from './stores/guildStore';
import { useReadStateStore } from './stores/peopleStores';
import { useSessionStore } from './stores/sessionStore';
import { ChannelType, type GuildFolder } from '../contracts/rest';
import { flatten } from '../domain/railLayout';

/** Acknowledges the newest message of a channel so its unread dot clears; does nothing when it is already read. The server call is best effort. */
export function markChannelRead(api: Pick<ApiPort, 'ack'>, channelId: string): void {
  const last = useGuildStore.getState().channels[channelId]?.last_message_id;
  if (!last) return;
  const read = useReadStateStore.getState().byChannel[channelId];
  if (read?.lastReadId === last && read.mentionCount === 0) return;
  useReadStateStore.getState().markRead(channelId, last);
  void api.ack(channelId, last).catch(() => undefined);
}

/** Marks every text channel of a server read. */
export function markGuildRead(api: Pick<ApiPort, 'ack'>, guildId: string): void {
  for (const channel of Object.values(useGuildStore.getState().channels)) {
    if (channel.guild_id === guildId && channel.type === ChannelType.GUILD_TEXT) markChannelRead(api, channel.id);
  }
}

/** Shows a new server-rail layout at once and syncs it to the user's other devices. A refused save puts the old layout back and throws. */
export async function saveRail(api: Pick<ApiPort, 'updateSettings'>, rail: GuildFolder[]): Promise<void> {
  const store = useGuildStore.getState();
  const previous = store.rail;
  store.setRail(rail);
  const next = useGuildStore.getState().rail;
  try {
    await api.updateSettings({ guild_folders: next, guild_positions: flatten(next) });
  } catch (error) {
    useGuildStore.getState().setRail(previous);
    throw error;
  }
}

/** Leaves a server (a member removes themselves) and forgets it locally. */
export async function leaveGuild(api: Pick<ApiPort, 'kickMember'>, guildId: string): Promise<void> {
  const me = useSessionStore.getState().user?.id;
  if (!me) return;
  await api.kickMember(guildId, me);
  useGuildStore.getState().removeGuild(guildId);
}

/** Deletes a server for everyone (the owner only; the server checks) and forgets it locally. */
export async function deleteGuild(api: Pick<ApiPort, 'deleteGuild'>, guildId: string): Promise<void> {
  await api.deleteGuild(guildId);
  useGuildStore.getState().removeGuild(guildId);
}
