import { RelationshipType, type GuildMember, type Relationship, type User } from '../contracts/rest';
import { assetCandidates } from './assets';

/** Longest "About me" text a profile may carry. */
export const BIO_MAX_LENGTH = 300;
export const PRONOUNS_MAX_LENGTH = 40;

/** Public profile colors are RGB values, never arbitrary CSS. Includes black. */
export function profileColor(color: number | null | undefined): string | undefined {
  return typeof color === 'number' && Number.isInteger(color) && color >= 0 && color <= 0xffffff
    ? `#${color.toString(16).padStart(6, '0')}` : undefined;
}

export function profileBackground(user: Pick<User, 'accent_color' | 'theme_colors'>): string | undefined {
  const colors = user.theme_colors;
  const first = colors?.length === 2 ? profileColor(colors[0]) : undefined;
  const second = colors?.length === 2 ? profileColor(colors[1]) : undefined;
  return first && second ? `linear-gradient(120deg, ${first}, ${second})` : profileColor(user.accent_color);
}

/** Server overrides fall back to the global profile; malformed paths never reach the CDN. */
export function profileImageCandidates(cdn: string, user: User, kind: 'avatars' | 'banners', member?: GuildMember, guildId?: string | null, size = 512): string[] {
  const override = kind === 'avatars' ? member?.avatar : member?.banner;
  const hash = override || (kind === 'avatars' ? user.avatar : user.banner);
  if (!hash || !/^[a-zA-Z0-9_-]+$/.test(hash) || !/^\d+$/.test(user.id)) return [];
  if (!override) return assetCandidates(cdn, kind, user.id, hash, size);
  if (!guildId || !/^\d+$/.test(guildId)) return [];
  const extension = hash.startsWith('a_') ? 'gif' : 'png';
  return [`${cdn}/guilds/${guildId}/users/${user.id}/${kind}/${hash}.${extension}?size=${size}`];
}

/** When two people became friends, or null when they are not friends or the time is unknown. */
export function friendsSince(relationship: Relationship | undefined): Date | null {
  if (relationship?.type !== RelationshipType.FRIEND || !relationship.since) return null;
  const date = new Date(relationship.since);
  return Number.isNaN(date.getTime()) ? null : date;
}
