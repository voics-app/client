import { useMemo } from 'react';
import type { SearchTarget } from '@discordy/core/application/searchService';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { searchCandidates } from '@discordy/core/domain/searchCandidates';
import { personName } from '../dms/dmModel';

/** What a search in this chat needs: the chat itself, where it is (for the heading) and the names `from:`, `mentions:` and `in:` can use. A server's chats search the whole server; a direct message searches itself. */
export function useSearchTarget(channelId: string): SearchTarget | null {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const guild = useGuildStore((s) => (channel?.guild_id ? s.guilds[channel.guild_id] : undefined));
  const members = useGuildStore((s) => (channel?.guild_id ? s.members[channel.guild_id] : undefined));
  const channels = useGuildStore((s) => s.channels);
  const me = useSessionStore((s) => s.user);
  return useMemo(() => {
    if (!channel) return null;
    const candidates = searchCandidates({
      channel,
      members,
      channels: Object.values(channels),
      me,
      displayName: (user, nick) => nick || personName(user as never, {}),
    });
    return { channel, guildName: guild?.name ?? null, mode: channel.delivery_mode, candidates };
  }, [channel, guild, members, channels, me]);
}
