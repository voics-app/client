import { describe, expect, it } from 'vitest';
import { NO_ZOOM, panBy, wheelFactor, zoomAround } from '@discordy/core/domain/panZoom';

const box = { width: 800, height: 400 };

describe('zoomAround', () => {
  it('zooms about the centre without moving the picture', () => {
    expect(zoomAround(NO_ZOOM, 2, { x: 0, y: 0 }, box)).toEqual({ zoom: 2, x: 0, y: 0 });
  });

  it('keeps the point under the pointer where it was', () => {
    const view = zoomAround(NO_ZOOM, 2, { x: 200, y: 100 }, box);
    // The point under the pointer: (200 - x) / zoom from the centre, same as before zooming (200).
    expect((200 - view.x) / view.zoom).toBeCloseTo(200);
    expect((100 - view.y) / view.zoom).toBeCloseTo(100);
  });

  it('stops at the maximum zoom and resets when zoomed back out to 1', () => {
    expect(zoomAround(NO_ZOOM, 100, { x: 0, y: 0 }, box).zoom).toBe(8);
    expect(zoomAround({ zoom: 2, x: 120, y: 40 }, 0.1, { x: 5, y: 5 }, box)).toEqual(NO_ZOOM);
  });

  it('never pans past the edge', () => {
    const view = zoomAround(NO_ZOOM, 2, { x: 400, y: 200 }, box);
    expect(Math.abs(view.x)).toBeLessThanOrEqual(400);
    expect(Math.abs(view.y)).toBeLessThanOrEqual(200);
  });
});

describe('panBy', () => {
  it('moves a zoomed view within its limits', () => {
    expect(panBy({ zoom: 2, x: 0, y: 0 }, 50, -30, box)).toEqual({ zoom: 2, x: 50, y: -30 });
    expect(panBy({ zoom: 2, x: 390, y: 0 }, 50, 0, box).x).toBe(400);
  });

  it('does nothing at 1x', () => {
    expect(panBy(NO_ZOOM, 50, 50, box)).toBe(NO_ZOOM);
  });
});

describe('wheelFactor', () => {
  it('zooms in on a scroll up and out on a scroll down', () => {
    expect(wheelFactor(-100, false)).toBeGreaterThan(1);
    expect(wheelFactor(100, false)).toBeLessThan(1);
  });

  it('scales a pinch finer than a wheel notch and by its own delta', () => {
    expect(wheelFactor(-5, true)).toBeGreaterThan(1);
    expect(wheelFactor(-5, true)).toBeLessThan(wheelFactor(-100, true));
  });
});
