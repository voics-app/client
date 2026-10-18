import { describe, expect, it } from 'vitest';
import { placeTooltip, type Rect } from '@renderer/interface/shared/ui/tooltipPlacement';

const rect = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewport = { width: 1280, height: 800 };
const tip = { width: 120, height: 30 };

describe('placeTooltip', () => {
  it('places a top tooltip above the centre of its trigger', () => {
    const p = placeTooltip(rect(500, 300, 40, 40), 'top', tip, viewport);
    expect(p).toEqual({ side: 'top', x: 520, y: 290 });
  });

  it('flips a top tooltip below when the trigger is at the top of the window', () => {
    const p = placeTooltip(rect(500, 4, 40, 30), 'top', tip, viewport);
    expect(p.side).toBe('bottom');
    expect(p.y).toBe(44);
  });

  it('flips a right tooltip to the left at the right edge', () => {
    const p = placeTooltip(rect(1240, 300, 40, 40), 'right', tip, viewport);
    expect(p.side).toBe('left');
  });

  it('keeps the preferred side when the opposite side has no more room', () => {
    const p = placeTooltip(rect(500, 4, 40, 30), 'top', tip, { width: 1280, height: 20 });
    expect(p.side).toBe('top');
  });

  it('clamps horizontally so a wide tooltip near the left edge stays on screen', () => {
    const p = placeTooltip(rect(0, 300, 20, 20), 'top', tip, viewport);
    expect(p.x).toBe(8 + 60);
  });

  it('clamps vertically for side tooltips near the bottom edge', () => {
    const p = placeTooltip(rect(600, 780, 40, 20), 'right', tip, viewport);
    expect(p.side).toBe('right');
    expect(p.y).toBe(800 - 8 - 15);
  });
});
