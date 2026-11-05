/** Channel reordering shared by the clients: the listed channels of a server and the optimistic bulk PATCH that reverts when refused. */
import type { ApiPort } from './ports/api';
import { useGuildStore } from './stores/guildStore';
import type { Channel } from '../contracts/rest';
import { isListed, type ChannelMove } from '../domain/channelOrder';

export const guildChannels = (guildId: string): Channel[] =>
  Object.values(useGuildStore.getState().channels).filter((c) => c.guild_id === guildId && isListed(c));

/** Shows the moves at once, sends them in one request and puts the old order back (and throws) when the server refuses. `extra` adds fields to the local copy, such as synced overwrites. */
export async function sendChannelMoves(api: Pick<ApiPort, 'reorderChannels'>, guildId: string, moves: ChannelMove[], extra: (move: ChannelMove) => Partial<Channel> = () => ({})): Promise<void> {
  const store = useGuildStore.getState();
  const before = moves.flatMap((m) => (store.channels[m.id] ? [store.channels[m.id]!] : []));
  for (const m of moves) {
    const current = store.channels[m.id];
    if (current) store.upsertChannel({ ...current, position: m.position, ...(m.parent_id !== undefined ? { parent_id: m.parent_id } : {}), ...extra(m) });
  }
  try {
    await api.reorderChannels(guildId, moves);
  } catch (error) {
    before.forEach((c) => useGuildStore.getState().upsertChannel(c));
    throw error;
  }
}
