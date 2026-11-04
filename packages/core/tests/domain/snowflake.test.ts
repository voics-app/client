import { describe, expect, it } from 'vitest';
import { DISCORDY_EPOCH_MS, bucketOf, compareSnowflakes, snowflakeFromTimestamp, timestampOf } from '@discordy/core/domain/snowflake';

describe('snowflake', () => {
  it('uses the Voics epoch 2026-01-01T00:00:00Z', () => {
    expect(DISCORDY_EPOCH_MS).toBe(1767225600000);
  });

  it('round-trips a timestamp through the 42-bit time field', () => {
    const ms = Date.UTC(2026, 9, 16, 12, 0, 0);
    const id = snowflakeFromTimestamp(ms);
    expect(timestampOf(id)).toBe(ms);
  });

  it('extracts the timestamp ignoring worker and sequence bits', () => {
    const base = BigInt(Date.UTC(2026, 1, 1) - DISCORDY_EPOCH_MS) << 22n;
    const id = (base | (130n << 12n) | 7n).toString();
    expect(timestampOf(id)).toBe(Date.UTC(2026, 1, 1));
  });

  it('computes the 10-day bucket per P5', () => {
    const tenDays = 864_000_000;
    expect(bucketOf(snowflakeFromTimestamp(DISCORDY_EPOCH_MS))).toBe(0);
    expect(bucketOf(snowflakeFromTimestamp(DISCORDY_EPOCH_MS + tenDays - 1))).toBe(0);
    expect(bucketOf(snowflakeFromTimestamp(DISCORDY_EPOCH_MS + tenDays))).toBe(1);
  });

  it('compares numerically, not lexicographically', () => {
    expect(compareSnowflakes('9', '10')).toBeLessThan(0);
    expect(compareSnowflakes('10', '9')).toBeGreaterThan(0);
    expect(compareSnowflakes('42', '42')).toBe(0);
  });
});
