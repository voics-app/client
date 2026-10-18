/** Snowflake helpers (P5): 42 bits ms since the Discordy epoch, 10 bits worker, 12 bits sequence. */

export const DISCORDY_EPOCH_MS = 1767225600000;
const BUCKET_MS = 864_000_000;

export function timestampOf(id: string): number {
  return Number(BigInt(id) >> 22n) + DISCORDY_EPOCH_MS;
}

/** Smallest snowflake for a given instant; useful for `before`/`after` paging cursors. */
export function snowflakeFromTimestamp(ms: number): string {
  return (BigInt(ms - DISCORDY_EPOCH_MS) << 22n).toString();
}

export function bucketOf(id: string): number {
  return Math.floor(Number(BigInt(id) >> 22n) / BUCKET_MS);
}

export function compareSnowflakes(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function maxSnowflake(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return compareSnowflakes(a, b) >= 0 ? a : b;
}
