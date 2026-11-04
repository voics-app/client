import { clampPan, clampZoom, MIN_ZOOM } from './media';

/** A zoomed view of a box: scale around the box centre, then shift by (x, y) pixels. */
export interface PanZoom {
  zoom: number;
  x: number;
  y: number;
}

export interface Box {
  width: number;
  height: number;
}

export const NO_ZOOM: PanZoom = { zoom: MIN_ZOOM, x: 0, y: 0 };

/** Scale-and-pan that keeps the point at `pointer` (pixels from the box's centre) fixed on screen. */
export function zoomAround(view: PanZoom, factor: number, pointer: { x: number; y: number }, box: Box): PanZoom {
  const zoom = clampZoom(view.zoom * factor);
  if (zoom === MIN_ZOOM) return NO_ZOOM;
  const ratio = zoom / view.zoom;
  return {
    zoom,
    x: clampPan(pointer.x - (pointer.x - view.x) * ratio, box.width, zoom),
    y: clampPan(pointer.y - (pointer.y - view.y) * ratio, box.height, zoom),
  };
}

/** Drags the view by (dx, dy), never past the edge of the picture. */
export function panBy(view: PanZoom, dx: number, dy: number, box: Box): PanZoom {
  if (view.zoom === MIN_ZOOM) return view;
  return { zoom: view.zoom, x: clampPan(view.x + dx, box.width, view.zoom), y: clampPan(view.y + dy, box.height, view.zoom) };
}

/** Wheel movement to a zoom factor; a trackpad pinch arrives as a wheel with ctrlKey and smaller deltas. */
export function wheelFactor(deltaY: number, pinch: boolean): number {
  const step = pinch ? 0.01 : 0.0015;
  return Math.exp(-Math.max(-100, Math.min(100, deltaY)) * step);
}
