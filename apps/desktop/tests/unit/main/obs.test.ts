import { describe, expect, it } from 'vitest';
import { containsObs } from '../../../src/main/obs';

describe('OBS process detection', () => {
  it('matches executable names rather than substrings or other columns', () => {
    expect(containsObs('"obs64.exe","123","Console"\r\n', true)).toBe(true);
    expect(containsObs('"notobs64.exe","123","OBS"\r\n', true)).toBe(false);
    expect(containsObs('/Applications/OBS.app/Contents/MacOS/OBS\n', false)).toBe(true);
    expect(containsObs('/usr/bin/obs-browser-page\n', false)).toBe(false);
    expect(containsObs('', true)).toBeNull();
  });
});
