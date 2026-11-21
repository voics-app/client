/** Content acknowledgement, never age verification or permission to access a server. */
export interface RestrictionChannel {
  id: string;
  type: number;
  guild_id?: string | null;
  parent_id?: string | null;
  nsfw?: boolean;
}

export type RestrictionContext =
  | { kind: 'unknown' }
  | { kind: 'public' | 'restricted'; fingerprint: string };

const PRIVATE_TYPES = new Set([1, 3]);
const THREAD_TYPES = new Set([10, 11, 12]);
const KNOWN_TYPES = new Set([0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 15]);

/** Parents may make a child restricted; incomplete or inconsistent ancestry cannot make it safe. */
export function restrictionContext(channelId: string, channels: Readonly<Record<string, RestrictionChannel>>): RestrictionContext {
  const first = channels[channelId];
  if (!first || first.id !== channelId) return { kind: 'unknown' };
  const seen = new Set<string>();
  const path: Array<[string, number, string | null, boolean]> = [];
  let channel: RestrictionChannel | undefined = first;
  let restricted = false;
  while (channel) {
    if (!KNOWN_TYPES.has(channel.type)
      || (channel.parent_id !== undefined && channel.parent_id !== null && (typeof channel.parent_id !== 'string' || !channel.parent_id))
      || (PRIVATE_TYPES.has(channel.type) && (channel.guild_id || channel.parent_id))) return { kind: 'unknown' };
    // Guild channel payloads must explicitly classify their content. An omitted flag is
    // not evidence that a partially loaded channel or ancestor is safe to show.
    if (seen.has(channel.id) || (!PRIVATE_TYPES.has(channel.type) && typeof channel.nsfw !== 'boolean')
      || (PRIVATE_TYPES.has(channel.type) && channel.nsfw !== undefined && typeof channel.nsfw !== 'boolean')) return { kind: 'unknown' };
    if (channel.guild_id !== first.guild_id || (!PRIVATE_TYPES.has(channel.type) && !channel.guild_id)) return { kind: 'unknown' };
    if (THREAD_TYPES.has(channel.type) && !channel.parent_id) return { kind: 'unknown' };
    seen.add(channel.id);
    restricted ||= channel.nsfw === true;
    path.push([channel.id, channel.type, channel.guild_id ?? null, channel.nsfw === true]);
    if (!channel.parent_id) break;
    channel = channels[channel.parent_id];
    if (!channel) return { kind: 'unknown' };
  }
  return { kind: restricted ? 'restricted' : 'public', fingerprint: JSON.stringify(path) };
}

/** Malformed values cannot silently opt somebody into showing restricted content. */
export const hidesAgeRestrictedChannels = (value: unknown): boolean => value !== undefined && value !== false;
