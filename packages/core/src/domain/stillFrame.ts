/** Helpers for showing a still picture instead of an animation (Accessibility: play GIFs, emoji and stickers automatically). */
export type AnimationKind = 'gif' | 'emoji' | 'sticker';

export const looksAnimated = (urlOrName: string | null | undefined, contentType?: string | null): boolean =>
  contentType === 'image/gif' || /\.(gif|apng)(\?|#|$)/i.test(urlOrName ?? '');
