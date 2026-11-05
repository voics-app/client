/** The api's bound for an emoji image, as desktop's upload hint says: 256 KB. */
export const MAX_EMOJI_BYTES = 256 * 1024;

export interface PickedEmoji {
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}

/** An emoji name is letters, digits and underscores, at most 32 characters, as desktop derives it from a file name. */
export function emojiNameFor(raw: string): string {
  return raw.replace(/\.[^.]+$/, '').replace(/\W+/g, '_').slice(0, 32);
}

/** The name and data URI to upload for a picked image, or why it cannot be uploaded. */
export function emojiUpload(asset: PickedEmoji): { name: string; uri: string } | { error: string } {
  if (!asset.base64) return { error: 'Could not read the image.' };
  if (Math.ceil((asset.base64.length * 3) / 4) > MAX_EMOJI_BYTES) return { error: 'Emoji images must be 256 KB or smaller.' };
  return { name: emojiNameFor(asset.fileName ?? '') || 'emoji', uri: `data:${asset.mimeType ?? 'image/png'};base64,${asset.base64}` };
}
