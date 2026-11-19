import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import type { AnimationKind } from '@discordy/core/domain/stillFrame';

const stills = new Map<string, string | null>();

/** First frame of an animated image as a PNG data URL; null when the browser cannot read the pixels (cross-origin without CORS). */
function firstFrame(src: string): Promise<string | null> {
  if (stills.has(src)) return Promise.resolve(stills.get(src) ?? null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        const url = canvas.toDataURL('image/png');
        stills.set(src, url);
        resolve(url);
      } catch {
        stills.set(src, null);
        resolve(null);
      }
    };
    img.onerror = () => {
      stills.set(src, null);
      resolve(null);
    };
    img.src = src;
  });
}

const PREF = { gif: 'animateGifs', emoji: 'animateEmoji', sticker: 'animateStickers' } as const;

/** An image that honours the matching "play automatically" preference: when off, an animated source shows its first frame and plays on hover or focus. */
export function AnimatedImage({ kind, animated, src, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { kind: AnimationKind; animated: boolean; src: string }) {
  const play = usePrefsStore((s) => s[PREF[kind]]);
  const still = animated && !play;
  const [frame, setFrame] = useState<string | null>(() => (still ? (stills.get(src) ?? null) : null));
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!still) return;
    let alive = true;
    void firstFrame(src).then((f) => alive && setFrame(f));
    return () => {
      alive = false;
    };
  }, [still, src]);
  return (
    <img
      {...rest}
      src={still && !hover ? (frame ?? undefined) : src}
      data-still={still && frame && !hover ? 'true' : undefined}
      onMouseEnter={(e) => { setHover(true); rest.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); rest.onMouseLeave?.(e); }}
    />
  );
}
