import { describe, expect, it } from 'vitest';
import { activeChoiceId, appendRtt, averageRtt, connectionRows, deviceChoices, formatLoss, formatMs, keysFor, qualityTone, RTT_HISTORY_LIMIT } from '@renderer/domain/voicePanel';
import { DEFAULT_KEYBINDS } from '@renderer/domain/keybinds';

const dev = (deviceId: string, kind: MediaDeviceKind, label: string) => ({ deviceId, kind, label });

describe('voicePanel', () => {
  it('grades quality by ping and loss', () => {
    expect(qualityTone(40, 0)).toBe('good');
    expect(qualityTone(150, 0)).toBe('fair');
    expect(qualityTone(40, 5)).toBe('fair');
    expect(qualityTone(300, 0)).toBe('poor');
    expect(qualityTone(40, 9)).toBe('poor');
  });

  it('keeps a bounded rtt history and averages it', () => {
    let h: number[] = [];
    for (let i = 0; i < RTT_HISTORY_LIMIT + 10; i++) h = appendRtt(h, i);
    expect(h).toHaveLength(RTT_HISTORY_LIMIT);
    expect(h[0]).toBe(10);
    expect(appendRtt([1], Number.NaN)).toEqual([1]);
    expect(averageRtt([])).toBeNull();
    expect(averageRtt([10, 20, 30])).toBe(20);
  });

  it('formats ping and loss', () => {
    expect(formatMs(null)).toBe('-');
    expect(formatMs(42.6)).toBe('43 ms');
    expect(formatLoss(1.234)).toBe('1.2%');
  });

  it('builds connection rows with and without stats', () => {
    const empty = connectionRows({ quality: null, history: [], region: null, e2ee: false });
    expect(empty.map((r) => r.label)).toEqual(['Average ping', 'Last ping', 'Outbound packet loss', 'Region', 'Encryption', 'Transport']);
    expect(empty.find((r) => r.label === 'Encryption')?.value).toBe('Transport only');
    const rows = connectionRows({ quality: { rttMs: 300, lossPct: 0.5, jitterMs: 4, bitrateKbps: 32.4 }, history: [100, 200], region: 'eu-west', e2ee: true });
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by['Average ping']?.value).toBe('150 ms');
    expect(by['Last ping']).toMatchObject({ value: '300 ms', tone: 'poor' });
    expect(by['Outbound packet loss']).toMatchObject({ value: '0.5%', tone: 'good' });
    expect(by.Region?.value).toBe('eu-west');
    expect(by.Encryption?.value).toContain('End-to-end');
  });

  it('lists devices of one kind after the system default, hiding virtual duplicates', () => {
    const list = [dev('default', 'audioinput', 'Default - Mic'), dev('a', 'audioinput', 'USB Mic'), dev('b', 'audioinput', ''), dev('s', 'audiooutput', 'Speakers')];
    expect(deviceChoices(list, 'audioinput', 'Microphone')).toEqual([
      { id: '', label: 'System default' },
      { id: 'a', label: 'USB Mic' },
      { id: 'b', label: 'Microphone 2' },
    ]);
  });

  it('falls back to the default when the stored device is gone', () => {
    const choices = [{ id: '', label: 'System default' }, { id: 'a', label: 'A' }];
    expect(activeChoiceId(choices, 'a')).toBe('a');
    expect(activeChoiceId(choices, 'gone')).toBe('');
    expect(activeChoiceId(choices, null)).toBe('');
  });

  it('reads the configured keybind for an action', () => {
    expect(keysFor(DEFAULT_KEYBINDS, 'toggleMute')).toBe('Ctrl+Shift+M');
    expect(keysFor([], 'toggleMute')).toBe('');
  });
});
