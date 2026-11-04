import type { Relationship, User } from '@discordy/core/contracts/rest';
import { assetCandidates } from '@discordy/core/domain/assets';
import { friendsSince } from '@discordy/core/domain/profile';

export interface ProfileView {
  name: string;
  username: string;
  /** About me; empty when the person wrote none. */
  bio: string;
  friendsSince: Date | null;
}

/** What the profile sheet shows. `fetchedBio` is the About me from the profile endpoint, newer than the one on cached users. */
export function profileView(user: User, relationship: Relationship | undefined, fetchedBio?: string): ProfileView {
  return {
    name: user.global_name || user.username,
    username: user.username,
    bio: fetchedBio ?? user.bio ?? '',
    friendsSince: friendsSince(relationship),
  };
}

/** Avatar image URLs to try in order; empty when the user has no avatar or the CDN is not configured. */
export function avatarUris(cdn: string, user: Pick<User, 'id' | 'avatar'>, size = 128): string[] {
  return cdn && user.avatar ? assetCandidates(cdn, 'avatars', user.id, user.avatar, size) : [];
}
