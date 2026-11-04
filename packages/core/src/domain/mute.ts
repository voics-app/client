export interface MuteDuration {
  id: string;
  label: string;
  /** Milliseconds, or null for "until I turn it back on". */
  ms: number | null;
}

export const MUTE_DURATIONS: MuteDuration[] = [
  { id: '15m', label: 'For 15 minutes', ms: 15 * 60_000 },
  { id: '1h', label: 'For 1 hour', ms: 60 * 60_000 },
  { id: '3h', label: 'For 3 hours', ms: 3 * 60 * 60_000 },
  { id: '8h', label: 'For 8 hours', ms: 8 * 60 * 60_000 },
  { id: '24h', label: 'For 24 hours', ms: 24 * 60 * 60_000 },
  { id: 'forever', label: 'Until I turn it back on', ms: null },
];

export interface MuteState {
  mutedChannels: Record<string, boolean>;
  /** Epoch ms at which a timed mute ends. Absent means "until turned back on". */
  muteUntil: Record<string, number>;
}

export function muteDuration(id: string): MuteDuration | undefined {
  return MUTE_DURATIONS.find((d) => d.id === id);
}

export function isIdMuted(state: MuteState, id: string | null | undefined, now: number): boolean {
  if (!id || !state.mutedChannels[id]) return false;
  const until = state.muteUntil?.[id];
  return until === undefined || until > now;
}

/** A channel is muted by its own mute or by its category's. */
export function isChannelMuted(state: MuteState, channel: { id: string; parent_id?: string | null }, now: number): boolean {
  return isIdMuted(state, channel.id, now) || isIdMuted(state, channel.parent_id, now);
}

export function applyMute(state: MuteState, ids: string[], ms: number | null, now: number): MuteState {
  const mutedChannels = { ...state.mutedChannels };
  const muteUntil = { ...(state.muteUntil ?? {}) };
  for (const id of ids) {
    mutedChannels[id] = true;
    if (ms === null) delete muteUntil[id];
    else muteUntil[id] = now + ms;
  }
  return { mutedChannels, muteUntil };
}

export function applyUnmute(state: MuteState, ids: string[]): MuteState {
  const mutedChannels = { ...state.mutedChannels };
  const muteUntil = { ...(state.muteUntil ?? {}) };
  for (const id of ids) {
    delete mutedChannels[id];
    delete muteUntil[id];
  }
  return { mutedChannels, muteUntil };
}
