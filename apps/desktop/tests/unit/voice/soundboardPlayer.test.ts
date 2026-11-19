import { describe, expect, it, vi } from 'vitest';
import { SoundboardPlayer } from '@renderer/infrastructure/audio/soundboardPlayer';

describe('SoundboardPlayer', () => {
  it('uses a separate destination and cancels a pending decode on stop', async () => {
    let finish!: (buffer: AudioBuffer) => void;
    const decoded = new Promise<AudioBuffer>((resolve) => { finish = resolve; });
    const track = { stop: vi.fn() };
    const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null };
    const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
    const context = {
      createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [track] } }),
      resume: vi.fn(async () => undefined),
      decodeAudioData: vi.fn(() => decoded),
      createBufferSource: () => source,
      createGain: () => gain,
      close: vi.fn(async () => undefined),
    } as unknown as AudioContext;
    const player = new SoundboardPlayer(context);
    expect(player.outgoingTrack).toBe(track);
    const pending = player.play(new ArrayBuffer(4), 0.5);
    await Promise.resolve();
    player.stop();
    finish({} as AudioBuffer);
    await pending;
    expect(source.start).not.toHaveBeenCalled();
    player.dispose();
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
