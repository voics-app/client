import { describe, expect, it } from 'vitest';
import { containsObs, obsRunning, windowsObsResult } from '../../../src/main/obs';

describe('OBS process detection', () => {
  it('matches executable names rather than substrings or other columns', () => {
    expect(containsObs('/Applications/OBS.app/Contents/MacOS/OBS\n')).toBe(true);
    expect(containsObs('/usr/bin/obs-browser-page\n')).toBe(false);
    expect(containsObs('')).toBeNull();
    expect(windowsObsResult('1\r\n')).toBe(true);
    expect(windowsObsResult('0\r\n')).toBe(false);
    expect(windowsObsResult('unexpected output')).toBeNull();
  });

  it.runIf(process.platform === 'win32' && process.env.VOICS_TEST_OBS_EXPECTED !== undefined)('enumerates real Windows process names', async () => {
    expect(await obsRunning()).toBe(process.env.VOICS_TEST_OBS_EXPECTED === '1');
  }, 20_000);
});
