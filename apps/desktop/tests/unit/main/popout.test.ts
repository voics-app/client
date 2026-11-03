import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: class {}, app: {}, nativeTheme: {}, session: {}, shell: {} }));

import { CALL_POPOUT_FRAME, isCallPopOut } from '../../../src/main/window';

describe('call pop-out window policy', () => {
  it('allows only the named about:blank child', () => {
    expect(isCallPopOut('about:blank', CALL_POPOUT_FRAME)).toBe(true);
    expect(isCallPopOut('about:blank', 'other')).toBe(false);
    expect(isCallPopOut('https://evil.example', CALL_POPOUT_FRAME)).toBe(false);
  });
});

describe('main window audio policy', () => {
  it('lets sounds start without a user gesture (ringtone, message and friend-request sounds)', async () => {
    const { mainWebPreferences } = await import('../../../src/main/window');
    const prefs = mainWebPreferences('/preload.js');
    expect(prefs.autoplayPolicy).toBe('no-user-gesture-required');
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
  });
});
