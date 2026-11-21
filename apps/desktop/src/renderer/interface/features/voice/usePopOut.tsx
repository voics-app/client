import { useCallback, useEffect, useRef, useState } from 'react';

export const POPOUT_FRAME = 'discordy-call-popout';

/** Mirrors the app's styles, theme attributes and tokens into the pop-out document so portaled React content looks identical. */
export function syncPopOutDocument(source: Document, target: Document): void {
  target.title = source.title;
  for (const attr of ['class', 'style', 'lang', 'dir', 'data-theme', 'data-accent', 'data-density', 'data-sidebar-density', 'data-link-underline', 'data-high-contrast', 'data-role-colors', 'data-compact-avatars', 'data-desaturated', 'data-reduce-motion']) {
    const value = source.documentElement.getAttribute(attr);
    if (value !== null) target.documentElement.setAttribute(attr, value);
    else target.documentElement.removeAttribute(attr);
  }
  target.head.replaceChildren();
  for (const node of source.head.querySelectorAll('link[rel="stylesheet"], style')) target.head.appendChild(node.cloneNode(true));
  target.body.className = source.body.className;
  target.body.style.cssText = 'margin:0;height:100vh;overflow:hidden;';
}

export interface PopOut {
  /** Element inside the pop-out window to portal into; null while docked. */
  container: HTMLElement | null;
  open(): void;
  close(): void;
}

/**
 * Opens the call in a secondary Electron window. The main process allows exactly this named about:blank child
 * (see `main/window.ts`); the window shares the renderer process so live MediaStreams render in it unchanged.
 */
export function usePopOut(): PopOut {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const win = useRef<Window | null>(null);

  const close = useCallback(() => {
    const w = win.current;
    win.current = null;
    setContainer(null);
    if (w && !w.closed) w.close();
  }, []);

  const open = useCallback(() => {
    if (win.current && !win.current.closed) {
      win.current.focus();
      return;
    }
    const w = window.open('about:blank', POPOUT_FRAME, 'popup,width=1040,height=680');
    if (!w) return;
    syncPopOutDocument(document, w.document);
    const root = w.document.createElement('div');
    root.id = 'popout-root';
    root.style.cssText = 'height:100%;display:flex;flex-direction:column;';
    w.document.body.appendChild(root);
    win.current = w;
    w.addEventListener('pagehide', () => {
      if (win.current === w) {
        win.current = null;
        setContainer(null);
      }
    });
    setContainer(root);
  }, []);

  useEffect(() => {
    if (!container) return;
    const sync = () => {
      for (const attribute of ['lang', 'dir']) {
        const value = document.documentElement.getAttribute(attribute);
        if (value === null) container.ownerDocument.documentElement.removeAttribute(attribute);
        else container.ownerDocument.documentElement.setAttribute(attribute, value);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
    return () => observer.disconnect();
  }, [container]);

  // The window must not outlive the page that feeds it.
  useEffect(() => {
    const onUnload = () => win.current?.close();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      onUnload();
    };
  }, []);

  return { container, open, close };
}
