import { describe, expect, it } from 'vitest';
import { TIMESTAMP_STYLES, localInputValues, parseLocalDateTime, timeTriggerMatches, timestampMarkup } from '@discordy/core/domain/timestampPicker';
import { parseMarkdown } from '@discordy/core/domain/markdown';

describe('timestamp picker model', () => {
  it('offers every Discord style', () => {
    expect(TIMESTAMP_STYLES.map((s) => s.style)).toEqual(['t', 'T', 'd', 'D', 'f', 'F', 'R']);
  });

  it('builds markup that the markdown parser reads back', () => {
    for (const { style } of TIMESTAMP_STYLES) {
      expect(parseMarkdown(timestampMarkup(1_700_000_000, style))).toEqual([{ type: 'timestamp', unix: 1_700_000_000, style }]);
    }
  });

  it('turns local date and time inputs into unix seconds', () => {
    expect(parseLocalDateTime('2026-11-04', '18:30')).toBe(Math.floor(new Date(2026, 10, 4, 18, 30).getTime() / 1000));
  });

  it('rejects empty or impossible input', () => {
    expect(parseLocalDateTime('', '10:00')).toBeNull();
    expect(parseLocalDateTime('2026-11-04', '')).toBeNull();
    expect(parseLocalDateTime('2026-02-31', '10:00')).toBeNull();
    expect(parseLocalDateTime('2026-11-04', '25:00')).toBeNull();
    expect(parseLocalDateTime('nope', '10:00')).toBeNull();
  });

  it('round-trips through the input values', () => {
    const unix = Math.floor(new Date(2027, 0, 9, 7, 5).getTime() / 1000);
    expect(localInputValues(unix)).toEqual({ date: '2027-01-09', time: '07:05' });
    const { date, time } = localInputValues(unix);
    expect(parseLocalDateTime(date, time)).toBe(unix);
  });

  it('matches the @time trigger from two letters on', () => {
    expect(timeTriggerMatches('t')).toBe(false);
    expect(timeTriggerMatches('ti')).toBe(true);
    expect(timeTriggerMatches('time')).toBe(true);
    expect(timeTriggerMatches('timer')).toBe(false);
    expect(timeTriggerMatches('tom')).toBe(false);
  });
});
