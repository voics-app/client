/** Largest icon the api accepts, the same 10 MiB bound the desktop client enforces. */
export const MAX_ICON_BYTES = 10 * 1024 * 1024;

export interface PickedImage {
  base64?: string | null;
  mimeType?: string | null;
}

/** The data URI to upload for a picked image, or why it cannot be uploaded. */
export function iconUpload(asset: PickedImage): { uri: string } | { error: string } {
  if (!asset.base64) return { error: 'Could not read the image.' };
  if (Math.ceil((asset.base64.length * 3) / 4) > MAX_ICON_BYTES) return { error: 'Images must be 10 MB or smaller.' };
  return { uri: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` };
}
