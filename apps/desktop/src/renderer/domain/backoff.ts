/** Exponential reconnect backoff with up to 25% jitter. */
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;

export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(attempt, 16));
  return Math.round(delay + delay * 0.25 * random());
}
