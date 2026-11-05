import { RelationshipType, type Relationship } from '@discordy/core/contracts/rest';
import { buildFriendsView, type FriendsTab, type PresenceLookup } from '@discordy/core/domain/friendsModel';

export const FRIEND_TABS: readonly { id: FriendsTab; label: string }[] = [
  { id: 'online', label: 'Online' },
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'add', label: 'Add friend' },
];

export interface FriendItem {
  kind: 'item';
  rel: Relationship;
  name: string;
  subtitle: string;
  /** Presence for the dot; null where it does not apply (requests and blocked people). */
  status: string | null;
}
export type FriendListEntry = { kind: 'heading'; title: string } | FriendItem;

const label = (status: string) => (status === 'dnd' ? 'Do not disturb' : status === 'offline' || status === 'invisible' ? 'Offline' : status[0]!.toUpperCase() + status.slice(1));

function item(rel: Relationship, presence: PresenceLookup): FriendItem {
  const name = rel.nickname || rel.user.global_name || rel.user.username;
  const status = presence[rel.id]?.status ?? 'offline';
  switch (rel.type) {
    case RelationshipType.INCOMING:
      return { kind: 'item', rel, name, subtitle: 'Incoming friend request', status: null };
    case RelationshipType.OUTGOING:
      return { kind: 'item', rel, name, subtitle: 'Outgoing friend request', status: null };
    case RelationshipType.BLOCKED:
      return { kind: 'item', rel, name, subtitle: 'Blocked', status: null };
    default:
      return { kind: 'item', rel, name, subtitle: label(status), status };
  }
}

export interface FriendsList {
  entries: FriendListEntry[];
  /** The count each tab shows, for the whole list rather than the search. */
  counts: Record<'online' | 'all' | 'pending' | 'blocked', number>;
}

/** The Friends page as flat list entries (headings with counts, then people) for the chosen tab and search, plus the tab counts. */
export function friendsList(all: readonly Relationship[], presence: PresenceLookup, tab: Exclude<FriendsTab, 'add'>, query: string): FriendsList {
  const total = buildFriendsView([...all], presence);
  const view = buildFriendsView([...all], presence, query);
  const section = (title: string, list: Relationship[]): FriendListEntry[] => (list.length === 0 ? [] : [{ kind: 'heading', title: `${title} - ${list.length}` }, ...list.map((r) => item(r, presence))]);
  const entries =
    tab === 'online' ? section('Online', view.online) : tab === 'all' ? section('All friends', view.friends) : tab === 'blocked' ? section('Blocked', view.blocked) : [...section('Incoming', view.incoming), ...section('Outgoing', view.outgoing)];
  return {
    entries,
    counts: { online: total.online.length, all: total.friends.length, pending: total.incoming.length + total.outgoing.length, blocked: total.blocked.length },
  };
}

/** The empty-state line of a tab. */
export function emptyFriendsText(tab: Exclude<FriendsTab, 'add'>, query: string): string {
  if (query.trim()) return 'Nobody in this list matches your search.';
  return tab === 'online' ? 'No friends online right now.' : tab === 'pending' ? 'No pending requests.' : tab === 'blocked' ? 'Nobody is blocked.' : 'No friends yet. Add someone by username.';
}
