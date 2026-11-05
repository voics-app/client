/** Motion tokens from desktop: base 220 ms with its ease-out curve, fast 150 ms for closing. */
export const OPEN_MS = 220;
export const CLOSE_MS = 150;
/** The backdrop dims to this much black, so the chat behind stays readable. */
export const BACKDROP_OPACITY = 0.45;
/** A drag past this distance (px) or faster than this velocity (px/ms) dismisses the sheet. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 0.8;

export function shouldDismiss(dy: number, vy: number): boolean {
  return dy > DISMISS_DISTANCE || vy > DISMISS_VELOCITY;
}
