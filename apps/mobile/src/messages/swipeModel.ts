/** How far (pt) a message must be dragged left to count as a reply. */
export const SWIPE_THRESHOLD = 64;
/** The message follows the finger this far at most, so the reply icon has room. */
export const SWIPE_MAX = 96;

/** Row offset for a horizontal drag: only leftwards, eased past the threshold, never beyond the maximum. */
export function swipeOffset(dx: number): number {
  if (dx >= 0) return 0;
  const pulled = -dx;
  const eased = pulled <= SWIPE_THRESHOLD ? pulled : SWIPE_THRESHOLD + (pulled - SWIPE_THRESHOLD) * 0.3;
  return -Math.min(SWIPE_MAX, eased);
}

/** True once the drag has gone far enough that letting go replies. */
export const pastThreshold = (dx: number): boolean => -dx >= SWIPE_THRESHOLD;

/** A drag is a swipe only when it is clearly horizontal and leftwards, so scrolling the list never starts one. */
export function isSwipeStart(dx: number, dy: number): boolean {
  return dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/** Icon opacity and scale from how close the drag is to the threshold. */
export function swipeProgress(dx: number): number {
  return Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD));
}
