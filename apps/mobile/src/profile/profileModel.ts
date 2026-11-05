import { RelationshipType, type GuildMember, type Relationship, type Role, type User } from '@discordy/core/contracts/rest';
import { assetCandidates } from '@discordy/core/domain/assets';
import { friendsSince } from '@discordy/core/domain/profile';

export interface ProfileView {
  name: string;
  username: string;
  /** About me; empty when the person wrote none. */
  bio: string;
  friendsSince: Date | null;
  /** Names of the roles the person holds in the server the profile was opened from, highest first; empty outside a server. */
  roles: string[];
  memberSince: Date | null;
}

export interface ServerContext {
  roles: readonly Role[];
  member: GuildMember;
}

/** What the profile sheet shows. `fetchedBio` is the About me from the profile endpoint, newer than the one on cached users. `server` adds roles and join date. */
export function profileView(user: User, relationship: Relationship | undefined, fetchedBio?: string, server?: ServerContext): ProfileView {
  const held = server ? server.roles.filter((r) => server.member.roles.includes(r.id)).sort((a, b) => b.position - a.position) : [];
  return {
    name: user.global_name || user.username,
    username: user.username,
    bio: fetchedBio ?? user.bio ?? '',
    friendsSince: friendsSince(relationship),
    roles: held.map((r) => r.name),
    memberSince: server?.member.joined_at ? new Date(server.member.joined_at) : null,
  };
}

/** Avatar image URLs to try in order; empty when the user has no avatar or the CDN is not configured. */
export function avatarUris(cdn: string, user: Pick<User, 'id' | 'avatar'>, size = 128): string[] {
  return cdn && user.avatar ? assetCandidates(cdn, 'avatars', user.id, user.avatar, size) : [];
}

export interface MutualServer {
  id: string;
  name: string;
  /** The person's nickname there, when they have one. */
  nick: string | null;
}

/** The servers you share with someone, by name; servers you have since left are dropped. */
export function mutualServers(shared: readonly { id: string; nick?: string | null }[], guilds: Record<string, { name: string }>): MutualServer[] {
  return shared.flatMap((g) => (guilds[g.id] ? [{ id: g.id, name: guilds[g.id]!.name, nick: g.nick || null }] : []));
}

export type FriendAction = 'add' | 'accept' | 'remove' | 'sent';

export interface ProfileActions {
  /** Message button: not for yourself, and not for someone who blocked or is blocked (a DM could not be sent). */
  message: boolean;
  friend: FriendAction | null;
  block: 'block' | 'unblock' | null;
}

/** Which relationship buttons a profile offers, as desktop's profile dialog does: none for yourself, no friending bots. */
export function profileActions(isMe: boolean, isBot: boolean, relationship: Relationship | undefined): ProfileActions {
  if (isMe) return { message: false, friend: null, block: null };
  const type = relationship?.type;
  const blocked = type === RelationshipType.BLOCKED;
  const friend: FriendAction | null = isBot || blocked ? null : type === RelationshipType.FRIEND ? 'remove' : type === RelationshipType.OUTGOING ? 'sent' : type === RelationshipType.INCOMING ? 'accept' : 'add';
  return { message: !blocked, friend, block: blocked ? 'unblock' : 'block' };
}
