/** Width (pt) of the strip at the right edge that starts the member-list swipe. */
export const EDGE_SWIPE_WIDTH = 16;
/** Leftward travel (pt) before the swipe takes the touch, and the vertical travel (pt) that hands it back to the list. */
export const EDGE_SWIPE_START = 10;
export const EDGE_SWIPE_FAIL_Y = 14;
const OPEN_DISTANCE = 60;
const OPEN_VELOCITY = 600;

/** Runs on the UI thread in the gesture's end callback: a drag of 60 pt, or a flick faster than 600 pt/s, to the left opens the list. */
export function passesEdgeSwipe(translationX: number, velocityX: number): boolean {
  'worklet';
  return translationX <= -OPEN_DISTANCE || velocityX <= -OPEN_VELOCITY;
}
