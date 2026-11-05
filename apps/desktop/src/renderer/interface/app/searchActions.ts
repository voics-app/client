/** Wires message search to the runtime: builds the search target from the open chat and runs it. */
import { SearchService, type SearchTarget } from '@discordy/core/application/searchService';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSearchStore } from '@discordy/core/application/stores/searchStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { searchCandidates } from '@discordy/core/domain/searchCandidates';
import { displayName } from '../shared/hooks/useNames';
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
  const candidates = searchCandidates({
    channel,
    members: channel.guild_id ? guilds.members[channel.guild_id] : undefined,
    channels: Object.values(guilds.channels),
    me: useSessionStore.getState().user,
    displayName,
  });
  return {
    channel,
    guildName: channel.guild_id ? (guilds.guilds[channel.guild_id]?.name ?? null) : null,
    mode: getRuntime().privacy.sender.resolveMode(channel),
    candidates,
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

export { jumpToMessage } from './actions';
