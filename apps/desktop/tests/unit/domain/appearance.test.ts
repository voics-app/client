import { describe, expect, it, vi } from 'vitest';
import { clampZoom, effectiveReduceMotion, effectiveTheme, parseTtsCommand, roleColorStyle, stepZoom, zoomActionOf } from '@renderer/domain/appearance';
import { looksAnimated } from '@renderer/domain/stillFrame';
import { speak } from '@renderer/infrastructure/tts';

describe('zoom', () => {
  it('steps by 10 percent within 50 to 200 and resets to 100', () => {
    expect(stepZoom(1, 'in')).toBe(1.1);
    expect(stepZoom(1.1, 'out')).toBe(1);
    expect(stepZoom(2, 'in')).toBe(2);
    expect(stepZoom(0.5, 'out')).toBe(0.5);
    expect(stepZoom(1.7, 'reset')).toBe(1);
    expect(clampZoom(9)).toBe(2);
    expect(stepZoom(0.9, 'in')).toBe(1);
  });
  it('maps Ctrl plus, minus and zero, and ignores other keys', () => {
    const k = (key: string, extra = {}) => zoomActionOf({ key, ctrlKey: true, metaKey: false, altKey: false, ...extra });
    expect([k('+'), k('='), k('-'), k('0'), k('a')]).toEqual(['in', 'in', 'out', 'reset', null]);
    expect(k('0', { ctrlKey: false })).toBeNull();
    expect(k('0', { altKey: true })).toBeNull();
  });
});

describe('theme and motion sync', () => {
  it('keeps the chosen theme unless syncing with the OS', () => {
    expect(effectiveTheme('oled', false, false)).toBe('oled');
    expect(effectiveTheme('oled', true, false)).toBe('light');
    expect(effectiveTheme('oled', true, true)).toBe('oled');
    expect(effectiveTheme('light', true, true)).toBe('dark');
  });
  it('reduces motion for the pref or for the OS when syncing', () => {
    expect(effectiveReduceMotion(false, true, true)).toBe(true);
    expect(effectiveReduceMotion(false, false, true)).toBe(false);
    expect(effectiveReduceMotion(true, false, false)).toBe(true);
  });
});

describe('role colours and tts', () => {
  it('tints, dots or hides', () => {
    expect(roleColorStyle('#f00', 'name')).toEqual({ tint: '#f00' });
    expect(roleColorStyle('#f00', 'dot')).toEqual({ dot: '#f00' });
    expect(roleColorStyle('#f00', 'hidden')).toEqual({});
    expect(roleColorStyle(undefined, 'dot')).toEqual({});
  });
  it('parses /tts', () => {
    expect(parseTtsCommand('/tts hello  world')).toBe('hello  world');
    expect(parseTtsCommand('/TTS hi')).toBe('hi');
    expect(parseTtsCommand('/tts')).toBeNull();
    expect(parseTtsCommand('/ttsx hi')).toBeNull();
    expect(parseTtsCommand('hello /tts hi')).toBeNull();
  });
  it('speaks cleaned text at a clamped rate', () => {
    const synth = { speak: vi.fn(), cancel: vi.fn() };
    expect(speak('hi <@123> see https://x.io **now**', 9, synth, () => ({ rate: 1 }))).toBe(true);
    const u = synth.speak.mock.calls[0]![0] as { rate: number };
    expect(u.rate).toBe(2);
    expect(speak('   ', 1, synth, () => ({ rate: 1 }))).toBe(false);
    expect(speak('x', 1, undefined)).toBe(false);
  });
  it('detects animated sources', () => {
    expect(looksAnimated('https://cdn/a.GIF?x=1')).toBe(true);
    expect(looksAnimated('a.png')).toBe(false);
    expect(looksAnimated('a', 'image/gif')).toBe(true);
  });
});
