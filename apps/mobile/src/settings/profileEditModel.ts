import type { User } from '@discordy/core/contracts/rest';
import { BIO_MAX_LENGTH } from '@discordy/core/domain/profile';
import { fromHex, toHex } from '../serverSettings/roleModel';

export const DISPLAY_NAME_MAX = 32;

export interface ProfileDraft {
  globalName: string;
  bio: string;
  /** Profile colour as `#rrggbb`; null keeps whatever the account has (possibly none). */
  color: string | null;
  /** A data URI of a newly picked image; undefined keeps the current one. */
  avatar?: string | undefined;
  banner?: string | undefined;
}

export const draftOf = (user: Pick<User, 'global_name' | 'bio'>): ProfileDraft => ({ globalName: user.global_name ?? '', bio: user.bio ?? '', color: null });

/** The fields the account update needs for a draft: only what changed, with the limits desktop's form enforces. Empty when nothing changed. */
export function profilePatch(user: Pick<User, 'global_name' | 'bio' | 'accent_color'>, draft: ProfileDraft): Partial<Pick<User, 'global_name' | 'bio' | 'accent_color' | 'avatar' | 'banner'>> {
  const patch: Partial<Pick<User, 'global_name' | 'bio' | 'accent_color' | 'avatar' | 'banner'>> = {};
  const name = draft.globalName.trim().slice(0, DISPLAY_NAME_MAX);
  if (name !== (user.global_name ?? '')) patch.global_name = name || null;
  const bio = draft.bio.slice(0, BIO_MAX_LENGTH);
  if (bio !== (user.bio ?? '')) patch.bio = bio;
  const color = draft.color ? fromHex(draft.color) : null;
  if (color !== null && color !== (user.accent_color ?? null)) patch.accent_color = color;
  if (draft.avatar) patch.avatar = draft.avatar;
  if (draft.banner) patch.banner = draft.banner;
  return patch;
}

/** The colour to show as chosen: the draft's, else the account's. */
export const shownColor = (user: Pick<User, 'accent_color'>, draft: ProfileDraft): string | null => draft.color ?? (user.accent_color ? toHex(user.accent_color) : null);
