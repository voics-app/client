import { useEffect } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { DM_SCOPE, useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import type { ContextCommand } from '@discordy/core/domain/contextCommands';
import type { Channel } from '@discordy/core/contracts/rest';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';

const dmLoads = new Map<string, number>();
const DM_REFRESH_MS = 60_000;

/**
 * USER and MESSAGE commands usable in `channelId`, for the Apps submenu. The command index is
 * fetched (once per guild) the first time `enabled` turns true, normally when a menu opens.
 */
export function useContextCommands(channelId: string | null | undefined, enabled: boolean): ContextCommand[] | undefined {
  const channel = useGuildStore((s) => (channelId ? s.channels[channelId] : undefined));
  const scope = channel ? (channel.guild_id ?? DM_SCOPE) : null;
  const commands = useInteractionStore((s) => (scope ? s.contextCommands[scope] : undefined));
  useEffect(() => {
    if (!enabled || !channel || !scope) return;
    const interactions = getRuntime().interactions;
    if (channel.guild_id) {
      void interactions.loadGuildCommands(channel.guild_id).catch(() => undefined);
      return;
    }
    const key = channel.id;
    if (Date.now() - (dmLoads.get(key) ?? 0) < DM_REFRESH_MS) return;
    dmLoads.set(key, Date.now());
    const bots = (channel.recipients ?? []).filter((u) => u.bot).map((u) => ({ id: u.id, name: displayName(u) }));
    void interactions.loadDirectCommands(bots).catch(() => dmLoads.delete(key));
  }, [enabled, channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return commands;
}

/** Runs a context command on a message or user and reports failures as a toast. */
export function runContextCommand(channel: Channel | undefined, command: ContextCommand | undefined, targetId: string): void {
  if (!channel || !command) return;
  void attempt(() => getRuntime().interactions.invokeContext(channel, command, targetId), 'Could not run command');
}
