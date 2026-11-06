import { describe, expect, it } from 'vitest';
import { DELETE_PRIVATE_NOTE, DISAPPEAR_NOTE, DISAPPEAR_OPTIONS, ttlLabel } from '../../src/domain/disappearing';

describe('disappearing message copy', () => {
  it('labels the preset timers and falls back to minutes', () => {
    expect(ttlLabel(null)).toBe('Off');
    expect(ttlLabel(undefined)).toBe('Off');
    expect(ttlLabel(3_600_000)).toBe('1 hour');
    expect(ttlLabel(10 * 60_000)).toBe('10 minutes');
    expect(DISAPPEAR_OPTIONS[0]).toEqual({ ttlMs: null, label: 'Off' });
  });

  it('does not promise more than a delete can do', () => {
    expect(DELETE_PRIVATE_NOTE).toMatch(/copied it or took a screenshot/);
    expect(DISAPPEAR_NOTE).toMatch(/cannot stop someone from copying or screenshotting/);
  });
});
