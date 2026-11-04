/** Personal pins (client#222, client#223): ordering and limits for pinned DMs and pinned channels. Pins are oldest first. */
import type { Channel } from '../contracts/rest';

export const MAX_PINNED_DMS = 5;
export const MAX_PINNED_PER_GUILD = 10;

/** Splits a list into the pinned entries (in pin order) and the rest (in list order). Pins of absent channels are ignored. */
export function orderPinnedFirst(list: Channel[], pins: string[]): { pinned: Channel[]; rest: Channel[] } {
  const byId = new Map(list.map((c) => [c.id, c]));
  const pinned = pins.flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
  const pinnedIds = new Set(pinned.map((c) => c.id));
  return { pinned, rest: list.filter((c) => !pinnedIds.has(c.id)) };
}

/** True when pinning `id` would exceed `max` (an already pinned id never does). */
export function isPinFull(pins: string[], id: string, max: number): boolean {
  return !pins.includes(id) && pins.length >= max;
}

/** The pins with `id` added last, or null when the limit is reached. */
export function withPin(pins: string[], id: string, max: number): string[] | null {
  if (pins.includes(id)) return pins;
  return pins.length >= max ? null : [...pins, id];
}

export function withoutPin(pins: string[], id: string): string[] {
  return pins.includes(id) ? pins.filter((p) => p !== id) : pins;
}

export function pinnedChannelsOf(byGuild: Record<string, string[]> | undefined, guildId: string): string[] {
  return byGuild?.[guildId] ?? [];
}
