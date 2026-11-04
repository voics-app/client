import { describe, expect, it } from 'vitest';
import { keyLabel, uiohookKeycode } from '@discordy/core/domain/uiohookKeys';

describe('uiohook key mapping', () => {
  it('maps common push-to-talk keys', () => {
    expect(uiohookKeycode('KeyV')).toBe(47);
    expect(uiohookKeycode('Space')).toBe(57);
    expect(uiohookKeycode('ControlRight')).toBe(3613);
  });
  it('returns null for unmapped keys', () => {
    expect(uiohookKeycode('MediaPlayPause')).toBeNull();
  });
  it('produces readable labels', () => {
    expect(keyLabel('KeyV')).toBe('V');
    expect(keyLabel('ShiftLeft')).toBe('Left Shift');
    expect(keyLabel('Digit5')).toBe('5');
  });
});
