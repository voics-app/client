/**
 * CDN URLs for hashed images (avatars, guild icons, banners). The CDN is plain object storage, so
 * the URL must name the stored key: animated images have an `a_` hash and a `.gif` key, static ones
 * a `.png` key. Images uploaded before that convention kept their own extension, so the remaining
 * extensions are fallbacks to try in order.
 */
export type AssetKind = 'avatars' | 'icons' | 'banners' | 'splashes' | 'channel-icons' | 'role-icons';

const LEGACY_EXTENSIONS = ['gif', 'webp', 'jpg'] as const;

export function assetCandidates(cdn: string, kind: AssetKind, id: string, hash: string, size = 128): string[] {
  const primary = hash.startsWith('a_') ? ['gif', 'png'] : ['png', ...LEGACY_EXTENSIONS];
  return primary.map((ext) => `${cdn}/${kind}/${id}/${hash}.${ext}?size=${size}`);
}
