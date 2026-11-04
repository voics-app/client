/** Rows are about this tall, matching the estimate `Menu` uses to keep itself inside the window. */
const ROW_HEIGHT = 34;
const PADDING = 16;
const MAX_HEIGHT = 480;
const GAP = 6;

export function estimatedMenuHeight(entryCount: number): number {
  return Math.min(entryCount * ROW_HEIGHT + PADDING, MAX_HEIGHT);
}

/** Top edge for a menu that opens upwards from a trigger, flipping below when there is no room above. */
export function menuTopAbove(trigger: { top: number; bottom: number }, entryCount: number, viewportHeight: number): number {
  const height = estimatedMenuHeight(entryCount);
  const above = trigger.top - GAP - height;
  if (above >= 8) return above;
  return Math.min(trigger.bottom + GAP, Math.max(8, viewportHeight - height - 12));
}
