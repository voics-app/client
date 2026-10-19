import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Fullscreen API for one element. `active` follows the document's fullscreen element, so Esc (handled by the browser) also updates it. */
export function useFullscreen<T extends HTMLElement>(ref: RefObject<T | null>): { active: boolean; toggle: () => void } {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(ref.current !== null && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen().catch(() => undefined);
  }, [ref]);

  return { active, toggle };
}
