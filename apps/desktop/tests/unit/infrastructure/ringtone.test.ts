import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INCOMING_RING, RINGTONE_PATTERNS, Ringtone } from '@renderer/infrastructure/audio/ringtone';

function fakeContext() {
  const oscillators: Array<{ frequency: { value: number }; type: string }> = [];
  const gains: Array<{ gain: { linearRampToValueAtTime: ReturnType<typeof vi.fn> } }> = [];
  const context = {
    currentTime: 0,
    destination: {},
    setSinkId: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createGain: () => {
      const gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    createOscillator: () => {
      const osc = { type: 'sine', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn() };
      oscillators.push(osc);
      return osc;
    },
  };
  return { context, oscillators, gains };
}

describe('Ringtone resilience', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('falls back to the default pattern for an unknown tone id and the default sink when the device is gone', async () => {
    const { context, oscillators } = fakeContext();
    const setSinkId = vi.fn(async (id: string) => {
      if (id) throw new Error('NotFoundError');
    });
    context.setSinkId = setSinkId as typeof context.setSinkId;
    const ringtone = new Ringtone(INCOMING_RING, { createContext: () => context as unknown as AudioContext });
    ringtone.start('gone', { tone: 'nope' as never, volume: Number.NaN });
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators.map((o) => o.frequency.value)).toEqual([440, 480]);
    expect(setSinkId).toHaveBeenLastCalledWith('');
    ringtone.stop();
  });

  it('resumes a context that gets suspended while ringing', () => {
    const { context } = fakeContext();
    const resume = vi.fn(async () => undefined);
    Object.assign(context, { state: 'suspended', resume });
    const ringtone = new Ringtone(INCOMING_RING, { createContext: () => context as unknown as AudioContext });
    ringtone.start(null);
    vi.advanceTimersByTime(3_000);
    expect(resume).toHaveBeenCalledTimes(3);
    ringtone.stop();
  });
});

describe('Ringtone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays a two-tone burst every cycle until stopped', () => {
    const { context, oscillators } = fakeContext();
    const ringtone = new Ringtone(INCOMING_RING, { createContext: () => context as unknown as AudioContext });

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
    const ringtone = new Ringtone(INCOMING_RING, { createContext: () => context as unknown as AudioContext });

    ringtone.start('speakers-1');
    ringtone.start('speakers-1');
    expect(context.setSinkId).toHaveBeenCalledTimes(1);
    expect(context.setSinkId).toHaveBeenCalledWith('speakers-1');
  });

  it('plays the chosen ringtone at the chosen volume', () => {
    const { context, oscillators, gains } = fakeContext();
    const ringtone = new Ringtone(INCOMING_RING, { createContext: () => context as unknown as AudioContext });

    ringtone.start(null, { tone: 'chime', volume: 0.5 });
    expect(oscillators.map((o) => o.frequency.value)).toEqual([659, 784, 988]);
    expect(oscillators.every((o) => o.type === 'triangle')).toBe(true);
    expect(gains[0]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(RINGTONE_PATTERNS.chime.gain * 0.5, expect.any(Number));
  });
});
