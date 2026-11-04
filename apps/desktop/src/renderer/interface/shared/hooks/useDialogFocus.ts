import { useEffect, type RefObject } from 'react';
import { trapTarget } from '@discordy/core/domain/rovingFocus';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** For full-screen overlays that are not a Modal: moves focus in, traps Tab, and returns focus to the trigger on close. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      if (!el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('[aria-current]') ?? el).focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const active = document.activeElement as HTMLElement | null;
      const target = trapTarget(items, active && el.contains(active) ? active : null, e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey, true);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [ref]);
}
