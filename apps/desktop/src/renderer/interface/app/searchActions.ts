/** Wires message search to the runtime: builds the search target from the open chat and runs it. */
import { SearchService, type SearchTarget } from '@renderer/application/search/searchService';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useSearchStore } from '@renderer/application/stores/searchStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { ChannelType } from '@shared/contracts/rest';
import { displayName } from '../shared/hooks/useNames';
import { openChannel } from './navigation';
import { getRuntime } from './runtime';

let service: SearchService | null = null;

function searchService(): SearchService {
  if (!service) {
    const { api, privacy } = getRuntime();
    service = new SearchService({ api, localMessages: (id) => privacy.sender.localMessages(id) });
  }
  return service;
}

/** Servers share one search scope; every direct message is its own. */
export function scopeKeyOf(channelId: string): string {
  const channel = useGuildStore.getState().channels[channelId];
  return channel?.guild_id ?? channelId;
}

export function searchTarget(channelId: string): SearchTarget | null {
  const guilds = useGuildStore.getState();
  const channel = guilds.channels[channelId];
  if (!channel) return null;
  const me = useSessionStore.getState().user;
  const users = new Map<string, { id: string; name: string }>();
  const addUser = (id: string, name: string) => users.set(`${id}:${name}`, { id, name });
  if (channel.guild_id) {
    for (const m of Object.values(guilds.members[channel.guild_id] ?? {})) {
      addUser(m.user.id, m.user.username);
      const shown = displayName(m.user, m.nick);
      if (shown !== m.user.username) addUser(m.user.id, shown);
    }
  } else {
    for (const u of [...(channel.recipients ?? []), ...(me ? [me] : [])]) addUser(u.id, u.username);
  }
  const channels = channel.guild_id
    ? Object.values(guilds.channels)
        .filter((c) => c.guild_id === channel.guild_id && (c.type === ChannelType.GUILD_TEXT || c.type === ChannelType.GUILD_ANNOUNCEMENT))
        .map((c) => ({ id: c.id, name: c.name ?? c.id }))
    : [];
  return {
    channel,
    guildName: channel.guild_id ? (guilds.guilds[channel.guild_id]?.name ?? null) : null,
    mode: getRuntime().privacy.sender.resolveMode(channel),
    candidates: { users: [...users.values()], channels },
  };
}

/** Opens the results panel and searches `input` (page `offset`) in the scope of the open chat. */
export async function submitSearch(channelId: string, input: string, offset = 0): Promise<void> {
  const target = searchTarget(channelId);
  if (!target) return;
  useSearchStore.getState().set({ scopeKey: scopeKeyOf(channelId) });
  useUiStore.getState().setSidePanel({ kind: 'search' });
  await searchService().run(target, input, { offset });
}

export async function rerunSearch(channelId: string, offset = 0): Promise<void> {
  await submitSearch(channelId, useSearchStore.getState().submitted, offset);
}

/** Opens the chat of a result and scrolls the message into view, loading history around it when needed. */
export function jumpToMessage(channelId: string, messageId: string): void {
  const ui = useUiStore.getState();
  if (ui.view.channelId !== channelId) openChannel(channelId);
  ui.jumpTo(channelId, messageId);
}
