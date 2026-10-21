import type { MessageTarget } from '@renderer/domain/messageMenuModel';

/**
 * Finds what was right-clicked inside a message. Renderers mark their elements with
 * `data-ctx="link|image|emoji"` plus data attributes, so this stays one handler on the message.
 */
export function targetFromElement(el: Element | null): MessageTarget {
  const marked = el?.closest<HTMLElement>('[data-ctx]');
  if (!marked) return { kind: 'message' };
  const d = marked.dataset;
  switch (d.ctx) {
    case 'link':
      return d.url ? { kind: 'link', url: d.url } : { kind: 'message' };
    case 'image':
      return d.src ? { kind: 'image', url: d.src, openUrl: d.open ?? d.src, filename: d.filename ?? 'image' } : { kind: 'message' };
    case 'emoji':
      return d.emojiId ? { kind: 'emoji', id: d.emojiId, name: d.emojiName ?? 'emoji', url: d.src ?? '', animated: d.animated === 'true' } : { kind: 'message' };
    default:
      return { kind: 'message' };
  }
}

/** Selected text when the selection lies inside `container`, else an empty string. */
export function selectionWithin(container: Element | null): string {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.isCollapsed || !container || !sel.anchorNode) return '';
  return container.contains(sel.anchorNode) ? sel.toString() : '';
}
