import { describe, expect, it, vi } from 'vitest';
import { installAudioUnlock, wakeContext } from '@renderer/infrastructure/audio/sharedContext';
import { Ringtone } from '@renderer/infrastructure/audio/ringtone';

function context(state: string) {
  const ctx = {
    state,
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    close: vi.fn(async () => undefined),
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() }),
    createOscillator: () => ({ type: 'sine', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn() }),
  };
  return ctx;
}

describe('audio unlock', () => {
  it('resumes a suspended context and reports a failed resume instead of swallowing it', async () => {
    const ctx = context('suspended');
    ctx.resume.mockRejectedValueOnce(new Error('NotAllowedError'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    wakeContext(ctx as unknown as AudioContext);
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps listening until a gesture leaves the context running, then removes its listeners', async () => {
    const ctx = context('suspended');
    ctx.resume.mockImplementation(async () => undefined);
    const handlers = new Map<string, () => void>();
    const target = {
      addEventListener: vi.fn((name: string, fn: () => void) => handlers.set(name, fn)),
      removeEventListener: vi.fn((name: string) => handlers.delete(name)),
    };
    installAudioUnlock(target, () => ctx as unknown as AudioContext);
    expect(handlers.has('pointerdown')).toBe(true);
    handlers.get('pointerdown')!();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    ctx.state = 'running';
    handlers.get('keydown')!();
    expect(handlers.size).toBe(0);
  });
});

describe('Ringtone on the shared context', () => {
  it('leaves a context it does not own open when ringing stops', () => {
    const ctx = context('running');
    const release = vi.fn();
    const ringtone = new Ringtone(undefined, { createContext: () => ctx as unknown as AudioContext, releaseContext: release });
    ringtone.start(null);
    ringtone.stop();
    expect(release).toHaveBeenCalledWith(ctx);
    expect(ctx.close).not.toHaveBeenCalled();
  });
});
