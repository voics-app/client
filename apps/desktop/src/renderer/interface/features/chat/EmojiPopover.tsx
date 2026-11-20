import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PickedEmoji } from './EmojiPicker';
import { LazyFeature } from '../../shared/ui/LazyFeature';

const loadEmojiPicker = () => import('./EmojiPicker').then(({ EmojiPicker }) => ({ default: EmojiPicker }));

interface Anchor {
  x: number;
  y: number;
  /** Open upwards from the point (composer) or downwards. */
  up: boolean;
}

/** Floating emoji picker anchored to a trigger. Returns the element to render plus an `open` opener. */
export function useEmojiPopover(guildId: string | null | undefined, onPick: (e: PickedEmoji) => void, channelId?: string | null): { node: ReactNode; open: (el: HTMLElement, up?: boolean) => void; openAt: (x: number, y: number, up?: boolean) => void; isOpen: boolean } {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.emoji-popover')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, close]);

  const open = useCallback((el: HTMLElement, up = true) => {
    const r = el.getBoundingClientRect();
    setAnchor({ x: Math.min(r.right, window.innerWidth - 12), y: up ? r.top - 8 : r.bottom + 8, up });
  }, []);

  const openAt = useCallback((x: number, y: number, up = false) => setAnchor({ x: Math.min(x + 320, window.innerWidth - 12), y, up }), []);

  const node = anchor
    ? createPortal(
        <div className="emoji-popover" style={{ left: anchor.x, top: anchor.y, transform: `translate(-100%, ${anchor.up ? '-100%' : '0'})` }}>
          <LazyFeature load={loadEmojiPicker} close={close} props={{ guildId, channelId, onPick: (e: PickedEmoji) => { onPick(e); close(); } }} />
        </div>,
        document.body,
      )
    : null;
  return { node, open, openAt, isOpen: anchor !== null };
}
