/** Pure keyboard-navigation rules shared by lists, menus and dialogs. */

export type RovingOrientation = 'vertical' | 'horizontal';

/**
 * Resolves the index a navigation key moves to inside a list, or null when the key is not
 * a navigation key. Arrow keys stop at the ends (Discord lists do not wrap); Home/End jump.
 */
export function rovingTarget(key: string, current: number, count: number, orientation: RovingOrientation = 'vertical'): number | null {
  if (count <= 0) return null;
  const prev = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const from = current < 0 ? 0 : current;
  switch (key) {
    case prev:
      return current < 0 ? count - 1 : Math.max(0, from - 1);
    case next:
      return current < 0 ? 0 : Math.min(count - 1, from + 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Index of the next/previous entry, wrapping around. With no current entry, forward picks the first and back the last. */
export function wrapIndex(count: number, current: number, delta: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}

/** Which element should receive focus when Tab is pressed inside a trapped dialog, or null to let the browser decide. */
export function trapTarget<T>(items: readonly T[], active: T | null, shift: boolean): T | null {
  if (items.length === 0) return null;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const index = active === null ? -1 : items.indexOf(active);
  if (index === -1) return shift ? last : first; // focus escaped the dialog
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}

/** Viewport point a keyboard-opened context menu should anchor to: just inside the element's top-left. */
export function contextMenuPoint(rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  return { x: Math.round(rect.left + Math.min(rect.width / 2, 40)), y: Math.round(rect.top + rect.height / 2) };
}

/** True for the keys that open a context menu from the keyboard (ContextMenu key, Shift+F10). */
export function isContextMenuKey(e: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  if (e.key === 'ContextMenu') return true;
  return e.key === 'F10' && e.shiftKey && !e.ctrlKey && !e.altKey;
}
