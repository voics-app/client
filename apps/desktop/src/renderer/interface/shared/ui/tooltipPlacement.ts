export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Rect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  side: Side;
  x: number;
  y: number;
}

const GAP = 10;
const MARGIN = 8;
const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function anchorFor(side: Side, trigger: Rect): { x: number; y: number } {
  const cx = trigger.left + trigger.width / 2;
  const cy = trigger.top + trigger.height / 2;
  switch (side) {
    case 'top':
      return { x: cx, y: trigger.top - GAP };
    case 'bottom':
      return { x: cx, y: trigger.bottom + GAP };
    case 'left':
      return { x: trigger.left - GAP, y: cy };
    case 'right':
      return { x: trigger.right + GAP, y: cy };
  }
}

/** Where a tooltip's anchor point goes (the CSS side classes translate the box from that point). Flips to the
 * opposite side when the preferred one has no room, and clamps the anchor so the box stays inside the viewport. */
export function placeTooltip(trigger: Rect, preferred: Side, tip: Size, viewport: Size): Placement {
  const vertical = preferred === 'top' || preferred === 'bottom';
  const needed = vertical ? tip.height : tip.width;
  const space = (side: Side): number => {
    switch (side) {
      case 'top':
        return trigger.top - GAP;
      case 'bottom':
        return viewport.height - trigger.bottom - GAP;
      case 'left':
        return trigger.left - GAP;
      case 'right':
        return viewport.width - trigger.right - GAP;
    }
  };
  const side = space(preferred) - MARGIN < needed && space(OPPOSITE[preferred]) > space(preferred) ? OPPOSITE[preferred] : preferred;
  const anchor = anchorFor(side, trigger);
  if (side === 'top' || side === 'bottom') {
    const half = tip.width / 2;
    const x = Math.min(Math.max(anchor.x, MARGIN + half), Math.max(MARGIN + half, viewport.width - MARGIN - half));
    return { side, x, y: anchor.y };
  }
  const half = tip.height / 2;
  const y = Math.min(Math.max(anchor.y, MARGIN + half), Math.max(MARGIN + half, viewport.height - MARGIN - half));
  return { side, x: anchor.x, y };
}
