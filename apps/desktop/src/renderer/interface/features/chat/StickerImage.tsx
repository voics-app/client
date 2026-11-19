import { useEffect, useRef, useState } from 'react';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import type { StickerItem } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '../../app/connectionStore';
import { AnimatedImage } from '../../shared/ui/AnimatedImage';

function unsafeLottie(value: unknown, depth = 0): boolean {
  if (depth > 128) return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => unsafeLottie(entry, depth + 1));
  return Object.entries(value).some(([key, entry]) =>
    ((key === 'p' || key === 'u' || key === 'x') && typeof entry === 'string') || unsafeLottie(entry, depth + 1));
}

function LottieSticker({ url, name, size }: { url: string; name: string; size: number }) {
  const container = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  const animate = usePrefsStore((state) => state.animateStickers);
  useEffect(() => {
    const controller = new AbortController();
    let animation: { destroy: () => void } | undefined;
    setFailed(false);
    void (async () => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Sticker unavailable');
      const source = await response.text();
      if (source.length > 512 * 1024) throw new Error('Sticker too large');
      const data: unknown = JSON.parse(source);
      if (unsafeLottie(data)) throw new Error('Unsupported sticker');
      const lottie = (await import('lottie-web')).default;
      if (!controller.signal.aborted && container.current) {
        animation = lottie.loadAnimation({ container: container.current, renderer: 'svg', loop: animate, autoplay: animate, animationData: data });
      }
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); animation?.destroy(); };
  }, [url, animate]);
  return failed ? <span role="img" aria-label={`Sticker: ${name}`}>Sticker unavailable</span> : <span ref={container} role="img" aria-label={`Sticker: ${name}`} style={{ display: 'inline-block', width: size, height: size }} />;
}

export function StickerImage({ sticker, size = 160 }: { sticker: StickerItem; size?: number }) {
  const cdn = useConnectionStore((state) => state.cdnUrl);
  const extension = sticker.format_type === 4 ? 'gif' : sticker.format_type === 3 ? 'json' : 'png';
  const url = `${cdn}/stickers/${sticker.id}.${extension}`;
  if (sticker.format_type === 3) return <LottieSticker url={url} name={sticker.name} size={size} />;
  return <AnimatedImage kind="sticker" animated={sticker.format_type !== 1} src={url} width={size} height={size} alt={`Sticker: ${sticker.name}`} draggable={false} />;
}
