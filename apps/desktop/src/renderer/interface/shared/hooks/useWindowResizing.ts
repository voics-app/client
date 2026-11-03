import { useEffect } from 'react';

export const RESIZE_SETTLE_MS = 150;

interface ResizeTarget {
  addEventListener(type: 'resize', listener: () => void): void;
  removeEventListener(type: 'resize', listener: () => void): void;
}

/** Sets `data-resizing` on the root while `target` keeps firing resize events and clears it once they have been quiet for `settleMs`. Returns a disposer. */
export function trackResizing(target: ResizeTarget, root: { dataset: Record<string, string | undefined> }, settleMs = RESIZE_SETTLE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    root.dataset.resizing = 'true';
    clearTimeout(timer);
    timer = setTimeout(() => { delete root.dataset.resizing; timer = undefined; }, settleMs);
  };
  target.addEventListener('resize', onResize);
  return () => {
    target.removeEventListener('resize', onResize);
    clearTimeout(timer);
    delete root.dataset.resizing;
  };
}

/** Lets CSS drop backdrop blur and transitions while the window is being resized, which otherwise leaves a trail on Windows. */
export function useWindowResizing(): void {
  useEffect(() => trackResizing(window, document.documentElement), []);
}
