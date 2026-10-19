import { useEffect, type RefObject } from 'react';
import { rovingTarget, type RovingOrientation } from '@renderer/domain/rovingFocus';

interface Options {
  /** CSS selector matching the navigable items inside the container. */
  selector: string;
  orientation?: RovingOrientation;
  /** Re-attaches when the container mounts late (for example after a loading state). */
  enabled?: boolean;
}

function visibleItems(root: HTMLElement, selector: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
}

/**
 * Roving tabindex for a list: exactly one item is a Tab stop, Up/Down/Home/End (Left/Right when
 * horizontal) move focus between items. Tabindex is set on the DOM so list rows need no extra props
 * and rows that mount later are picked up through a MutationObserver. Keys pressed inside nested
 * controls (inputs, the message editor) are left alone: only the item itself handles navigation.
 */
export function useRovingFocus(ref: RefObject<HTMLElement | null>, { selector, orientation = 'vertical', enabled = true }: Options): void {
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    let stop: HTMLElement | null = null;

    const sync = () => {
      const items = visibleItems(root, selector);
      if (items.length === 0) return;
      if (!stop || !items.includes(stop)) {
        stop = items.find((el) => el.getAttribute('aria-current') === 'true' || el.getAttribute('aria-current') === 'page') ?? items[0]!;
      }
      for (const el of items) {
        const want = el === stop ? '0' : '-1';
        if (el.getAttribute('tabindex') !== want) el.setAttribute('tabindex', want);
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const item = (e.target as HTMLElement | null)?.closest<HTMLElement>(selector);
      if (item && root.contains(item) && item !== stop) {
        stop = item;
        sync();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const item = target?.closest<HTMLElement>(selector);
      if (!item || item !== target || !root.contains(item)) return;
      const items = visibleItems(root, selector);
      const next = rovingTarget(e.key, items.indexOf(item), items.length, orientation);
      if (next === null) return;
      e.preventDefault();
      const el = items[next];
      if (el && el !== item) {
        stop = el;
        sync();
        el.focus();
        el.scrollIntoView?.({ block: 'nearest' });
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, selector, orientation, enabled]);
}
