import { useEffect } from 'react';
import { DM_SCOPE, useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import type { Channel } from '@discordy/core/contracts/rest';
import { searchEntries, slashQuery, type SlashEntry } from '@discordy/core/domain/slashCommand';
import { getRuntime } from '../runtime';

/** A direct conversation's commands are fetched again after a minute, as on desktop. */
const COMMAND_REFRESH_MS = 60_000;
const SUGGESTIONS = 6;
const directLoads = new Map<string, number>();

export interface SlashState {
  /** The text after the `/`, or null when the composer is not searching for a command. */
  query: string | null;
  entries: SlashEntry[];
  appName(applicationId: string): string | undefined;
}

/**
 * Command search for the composer: while the text is `/` and a few letters, the commands of the server (or of the bots and your own apps in a
 * direct conversation) that match. `channel` is undefined where commands are not allowed (no permission, private delivery).
 */
export function useSlashCommands(channel: Channel | undefined, text: string, enabled: boolean): SlashState {
  const query = enabled && channel ? slashQuery(text) : null;
  const scope = channel?.guild_id ?? DM_SCOPE;
  const catalogue = useInteractionStore((s) => s.commands[scope]);
  const appNames = useInteractionStore((s) => s.appNames);
  const searching = query !== null;

  useEffect(() => {
    if (!searching || !channel) return;
    const interactions = getRuntime().interactions;
    if (channel.guild_id) {
      void interactions.loadGuildCommands(channel.guild_id).catch(() => undefined);
      return;
    }
    const key = `${DM_SCOPE}:${channel.id}`;
    if (Date.now() - (directLoads.get(key) ?? 0) < COMMAND_REFRESH_MS) return;
    directLoads.set(key, Date.now());
    const bots = (channel.recipients ?? []).filter((u) => u.bot).map((u) => ({ id: u.id, name: u.global_name || u.username }));
    void interactions.loadDirectCommands(bots).catch(() => directLoads.delete(key));
    // The load depends on the chat and on whether a search is open, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, channel?.id]);

  return { query, entries: query === null ? [] : searchEntries(catalogue ?? [], query, SUGGESTIONS), appName: (id) => appNames[id] };
}
