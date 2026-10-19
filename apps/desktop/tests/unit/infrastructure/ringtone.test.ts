import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ringtone } from '@renderer/infrastructure/audio/ringtone';

function fakeContext() {
  const oscillators: Array<{ frequency: { value: number }; type: string }> = [];
  const context = {
    currentTime: 0,
    destination: {},
    setSinkId: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() }),
    createOscillator: () => {
      const osc = { type: 'sine', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn() };
      oscillators.push(osc);
      return osc;
    },
  };
  return { context, oscillators };
}

describe('Ringtone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays a two-tone burst every cycle until stopped', () => {
    const { context, oscillators } = fakeContext();
    const ringtone = new Ringtone({ createContext: () => context as unknown as AudioContext });

    ringtone.start(null);
    expect(oscillators.map((o) => o.frequency.value)).toEqual([440, 480]);
    expect(context.setSinkId).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3_000);
    expect(oscillators).toHaveLength(4);

    ringtone.stop();
    expect(context.close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9_000);
    expect(oscillators).toHaveLength(4);
  });

  it('routes the tone to the chosen output device and starts once', () => {
    const { context } = fakeContext();
    const ringtone = new Ringtone({ createContext: () => context as unknown as AudioContext });

    ringtone.start('speakers-1');
    ringtone.start('speakers-1');
    expect(context.setSinkId).toHaveBeenCalledTimes(1);
    expect(context.setSinkId).toHaveBeenCalledWith('speakers-1');
  });
});
