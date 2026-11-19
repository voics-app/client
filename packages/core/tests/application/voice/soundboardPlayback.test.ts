import { describe, expect, it, vi } from 'vitest';
import { SoundboardPlayback, type SoundboardCall } from '@discordy/core/application/voice/soundboardPlayback';

describe('SoundboardPlayback', () => {
  it('authorizes the current call before fetching and playing', async () => {
    const call: SoundboardCall = { sessionId: 's1', channelId: 'c1', canPublish: true, mediaReady: true };
    const deps = { call: () => call, authorize: vi.fn(async () => undefined), fetchAudio: vi.fn(async () => new ArrayBuffer(2)), play: vi.fn(async () => undefined), stop: vi.fn() };
    const playback = new SoundboardPlayback(deps);
    await playback.play('g1', 'sound1', 0.5);
    expect(deps.authorize).toHaveBeenCalledWith('c1', 'g1', 'sound1');
    expect(deps.fetchAudio).toHaveBeenCalledWith('g1', 'sound1');
    expect(deps.play).toHaveBeenCalledOnce();
    expect(deps.authorize.mock.invocationCallOrder[0]!).toBeLessThan(deps.fetchAudio.mock.invocationCallOrder[0]!);
  });

  it('does not play when the caller changes channels during authorization', async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    const call: SoundboardCall = { sessionId: 's1', channelId: 'c1', canPublish: true, mediaReady: true };
    const deps = { call: () => call, authorize: vi.fn(() => waiting), fetchAudio: vi.fn(async () => new ArrayBuffer(0)), play: vi.fn(async () => undefined), stop: vi.fn() };
    const playback = new SoundboardPlayback(deps);
    const result = playback.play('g1', 'sound1', 1);
    call.channelId = 'c2';
    finish();
    await expect(result).rejects.toThrow('changed');
    expect(deps.fetchAudio).not.toHaveBeenCalled();
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.stop).toHaveBeenCalled();
  });

  it('refuses missing publication or media readiness', async () => {
    const call: SoundboardCall = { sessionId: 's1', channelId: 'c1', canPublish: false, mediaReady: true };
    const deps = { call: () => call, authorize: vi.fn(async () => undefined), fetchAudio: vi.fn(async () => new ArrayBuffer(0)), play: vi.fn(async () => undefined), stop: vi.fn() };
    await expect(new SoundboardPlayback(deps).play('g1', 'sound1', 1)).rejects.toThrow('unavailable');
    expect(deps.authorize).not.toHaveBeenCalled();
  });
});
