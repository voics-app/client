import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { NO_ZOOM, panBy, wheelFactor, zoomAround, type PanZoom } from '@discordy/core/domain/panZoom';

/** Parts of the element that keep their own mouse behaviour (buttons and the like). */
const OWN_CONTROLS = '.tile-tools, .tile-watch, .tile-zoom, button';

/**
 * Wheel or pinch zooms an element's picture about the pointer, dragging pans it while zoomed.
 * Returns the style to put on the picture; `reset` goes back to 1x.
 */
export function usePanZoom<T extends HTMLElement>(ref: RefObject<T | null>, enabled: boolean): { view: PanZoom; zoomed: boolean; style: CSSProperties | undefined; reset: () => void } {
  const [view, setView] = useState<PanZoom>(NO_ZOOM);
  const current = useRef(view);
  current.current = view;
  const reset = useCallback(() => setView(NO_ZOOM), []);

  useEffect(() => {
    if (!enabled) setView(NO_ZOOM);
  }, [enabled]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let drag: { x: number; y: number } | null = null;

    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(OWN_CONTROLS)) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const pointer = { x: e.clientX - (box.left + box.width / 2), y: e.clientY - (box.top + box.height / 2) };
      setView(zoomAround(current.current, wheelFactor(e.deltaY, e.ctrlKey), pointer, box));
    };
    const onDown = (e: PointerEvent) => {
      if (current.current.zoom === 1 || e.button !== 0 || (e.target as HTMLElement).closest(OWN_CONTROLS)) return;
      el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      setView(panBy(current.current, dx, dy, el.getBoundingClientRect()));
    };
    const onUp = () => {
      drag = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [ref, enabled]);

  const zoomed = view.zoom > 1;
  return { view, zoomed, reset, style: zoomed ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` } : undefined };
}
