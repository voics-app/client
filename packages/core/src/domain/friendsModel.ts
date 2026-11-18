/** Pure view model of the Friends page: tab lists, counts, search and the Active Now column. */
import { RelationshipType, type Activity, type Relationship, type VoiceState } from '../contracts/rest';
import { createI18n } from './i18n';

export type FriendsTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';
export type PresenceLookup = Record<string, { status: string; activities?: Activity[] } | undefined>;

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
  kind: 'voice' | 'playing' | 'status' | 'activity';
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
    const current = presence[rel.id];
    if (!current || current.status === 'offline' || current.status === 'invisible') continue;
    const activity = current.activities?.find((a) => a.type !== 4 && a.name.trim())
      ?? current.activities?.find((a) => a.type === 4 && (a.state?.trim() || a.emoji?.name));
    if (!activity) continue;
    const kind = activity.type === 0 ? 'playing' : activity.type === 4 ? 'status' : 'activity';
    const detail = activity.type === 4 ? (activity.state?.trim() || activity.emoji?.name || '')
      : activity.type === 2 ? `Listening to ${activity.name}`
      : activity.type === 3 ? `Watching ${activity.name}`
      : activity.type === 1 ? `Streaming ${activity.name}`
      : activity.type === 5 ? `Competing in ${activity.name}` : activity.name;
    entries.push({ rel, kind, detail, guildId: null, channelId: null });
  }
  return entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'voice' ? -1 : 1));
}

/** Clear, actionable text for a failed "add friend by username". */
export function friendRequestError(status: number, serverMessage: string, username: string, locale?: string): string {
  const { t } = createI18n(locale);
  if (status === 0) return t('friends.offline');
  if (status === 404) return t('friends.notFound', { name: username });
  if (status === 403) return t('friends.notAccepting', { name: username });
  if (status === 429) return t('friends.rateLimited');
  if (status === 400 && /self|yourself/i.test(serverMessage)) return t('friends.self');
  if (status === 400 && /bot/i.test(serverMessage)) return t('friends.bot');
  return serverMessage || t('friends.requestFailed');
}
