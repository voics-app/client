/** The names a search query can refer to (`from:`, `mentions:`, `in:`) for the chat being searched. */
import { ChannelType, type Channel, type GuildMember, type User } from '../contracts/rest';
import type { SuggestionContext } from './messageSearch';

export interface SearchCandidateSources {
  channel: Channel;
  /** The members of the channel's server, when it has one. */
  members: Record<string, GuildMember> | undefined;
  /** Every channel the client knows. */
  channels: readonly Channel[];
  me: User | null;
  displayName(user: Pick<User, 'username' | 'global_name'>, nick?: string | null): string;
}

/** In a server: its members (by username and by the name shown) and its text channels. In a direct message: you and the people in it. */
export function searchCandidates({ channel, members, channels, me, displayName }: SearchCandidateSources): SuggestionContext {
  const users = new Map<string, { id: string; name: string }>();
  const addUser = (id: string, name: string) => users.set(`${id}:${name}`, { id, name });
  if (channel.guild_id) {
    for (const m of Object.values(members ?? {})) {
      addUser(m.user.id, m.user.username);
      const shown = displayName(m.user, m.nick);
      if (shown !== m.user.username) addUser(m.user.id, shown);
    }
  } else {
    for (const u of [...(channel.recipients ?? []), ...(me ? [me] : [])]) addUser(u.id, u.username);
  }
  return {
    users: [...users.values()],
    channels: channel.guild_id
      ? channels.filter((c) => c.guild_id === channel.guild_id && (c.type === ChannelType.GUILD_TEXT || c.type === ChannelType.GUILD_ANNOUNCEMENT)).map((c) => ({ id: c.id, name: c.name ?? c.id }))
      : [],
  };
}
