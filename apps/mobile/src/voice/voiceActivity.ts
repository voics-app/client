/** Decides from the microphone level whether the user is speaking: above a threshold, then held for a moment so words do not flicker. */
export interface ActivityGate {
  /** `level` is 0 to 1; returns whether the user counts as speaking at `now` (ms). */
  update(level: number, now: number): boolean;
  reset(): void;
}

export const SPEAKING_THRESHOLD = 0.02;
export const SPEAKING_HOLD_MS = 300;

export function createActivityGate(threshold = SPEAKING_THRESHOLD, holdMs = SPEAKING_HOLD_MS): ActivityGate {
  let lastLoud = Number.NEGATIVE_INFINITY;
  return {
    update(level, now) {
      if (level >= threshold) lastLoud = now;
      return now - lastLoud <= holdMs;
    },
    reset() {
      lastLoud = Number.NEGATIVE_INFINITY;
    },
  };
}
