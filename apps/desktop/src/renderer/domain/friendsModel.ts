/** Pure view model of the Friends page: tab lists, counts, search and the Active Now column. */
import { RelationshipType, type Relationship, type VoiceState } from '@shared/contracts/rest';

export type FriendsTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';
export type PresenceLookup = Record<string, { status: string; activities?: { type: number; name: string }[] } | undefined>;

export interface FriendsView {
  friends: Relationship[];
  online: Relationship[];
  incoming: Relationship[];
  outgoing: Relationship[];
  blocked: Relationship[];
}

export function relName(rel: Relationship): string {
  return (rel.nickname || rel.user.global_name || rel.user.username || '').toLowerCase();
}

/** Case-insensitive match on nickname, display name and username. */
export function matchesQuery(rel: Relationship, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [rel.nickname, rel.user.global_name, rel.user.username].some((v) => v?.toLowerCase().includes(q));
}

const byName = (a: Relationship, b: Relationship) => relName(a).localeCompare(relName(b));

export function buildFriendsView(all: Relationship[], presence: PresenceLookup, query = ''): FriendsView {
  const pick = (type: number) => all.filter((r) => r.type === type && matchesQuery(r, query)).sort(byName);
  const friends = pick(RelationshipType.FRIEND);
  return {
    friends,
    online: friends.filter((r) => (presence[r.id]?.status ?? 'offline') !== 'offline'),
    incoming: pick(RelationshipType.INCOMING),
    outgoing: pick(RelationshipType.OUTGOING),
    blocked: pick(RelationshipType.BLOCKED),
  };
}

export interface ActiveNowEntry {
  rel: Relationship;
  kind: 'voice' | 'playing';
  /** Voice channel id or game name. */
  detail: string;
  guildId: string | null;
  channelId: string | null;
}

/** Friends currently in a voice channel or playing something, voice first. */
export function activeNow(friends: Relationship[], voice: Record<string, Record<string, VoiceState>>, presence: PresenceLookup): ActiveNowEntry[] {
  const inVoice = new Map<string, VoiceState>();
  for (const scope of Object.values(voice)) for (const vs of Object.values(scope)) if (vs.channel_id) inVoice.set(vs.user_id, vs);
  const entries: ActiveNowEntry[] = [];
  for (const rel of friends) {
    const vs = inVoice.get(rel.id);
    if (vs?.channel_id) {
      entries.push({ rel, kind: 'voice', detail: vs.channel_id, guildId: vs.guild_id ?? null, channelId: vs.channel_id });
      continue;
    }
    const game = presence[rel.id]?.activities?.find((a) => a.type === 0);
    if (game) entries.push({ rel, kind: 'playing', detail: game.name, guildId: null, channelId: null });
  }
  return entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'voice' ? -1 : 1));
}

/** Clear, actionable text for a failed "add friend by username". */
export function friendRequestError(status: number, serverMessage: string, username: string): string {
  if (status === 0) return 'You appear to be offline. Try again when you are connected.';
  if (status === 404) return `We could not find anyone named "${username}". Check the spelling and try again.`;
  if (status === 403) return `${username} is not accepting friend requests from you.`;
  if (status === 429) return 'You are sending requests too quickly. Wait a moment and try again.';
  if (status === 400 && /self|yourself/i.test(serverMessage)) return 'You cannot add yourself as a friend.';
  if (status === 400 && /bot/i.test(serverMessage)) return 'Bots cannot be added as friends.';
  return serverMessage || 'The request could not be sent.';
}
