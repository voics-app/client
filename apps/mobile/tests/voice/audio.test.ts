import type { NativeAudioStream, NativeAudioTrack } from '../../src/voice/nativeVoice';
import { AudioRoute } from '../../src/voice/audioRoute';
import { MobileMic } from '../../src/voice/mobileMic';
import { MobileMixer } from '../../src/voice/mobileMixer';
import { createActivityGate } from '../../src/voice/voiceActivity';

function track(): NativeAudioTrack & { volume: number | null; stopped: boolean } {
  const t = {
    kind: 'audio',
    enabled: true,
    volume: null as number | null,
    stopped: false,
    stop() {
      t.stopped = true;
    },
    _setVolume(v: number) {
      t.volume = v;
    },
  };
  return t;
}
const stream = (...tracks: NativeAudioTrack[]): NativeAudioStream => ({ getTracks: () => tracks, getVideoTracks: () => [], getAudioTracks: () => tracks });

describe('activity gate', () => {
  it('counts as speaking above the threshold and holds for a moment afterwards', () => {
    const gate = createActivityGate(0.05, 300);
    expect(gate.update(0.01, 0)).toBe(false);
    expect(gate.update(0.2, 100)).toBe(true);
    expect(gate.update(0.0, 350)).toBe(true);
    expect(gate.update(0.0, 450)).toBe(false);
  });

  it('forgets earlier speech after a reset', () => {
    const gate = createActivityGate(0.05, 300);
    gate.update(0.5, 0);
    gate.reset();
    expect(gate.update(0, 10)).toBe(false);
  });
});

describe('MobileMic', () => {
  function setup() {
    const t = track();
    let now = 0;
    const mic = new MobileMic(async () => t, createActivityGate(0.05, 300), () => now);
    const seen: [number, boolean][] = [];
    mic.onLevel((level, transmitting) => seen.push([level, transmitting]));
    return { t, mic, seen, advance: (ms: number) => (now += ms) };
  }

  it('hands out the track and switches it off while muted', async () => {
    const { t, mic } = setup();
    expect(await mic.start()).toBe(t);
    mic.setSelfMute(true);
    expect(t.enabled).toBe(false);
    mic.setSelfMute(false);
    expect(t.enabled).toBe(true);
  });

  it('starts a track that is muted already when the user was muted before joining', async () => {
    const { t, mic } = setup();
    mic.setSelfMute(true);
    await mic.start();
    expect(t.enabled).toBe(false);
  });

  it('only sends while PTT is held, and mute still wins', async () => {
    const { t, mic } = setup();
    mic.setForcePushToTalk(true);
    await mic.start();
    expect(t.enabled).toBe(false);
    mic.setPushToTalk(true);
    expect(t.enabled).toBe(true);
    mic.setSelfMute(true);
    expect(t.enabled).toBe(false);
    mic.setSelfMute(false);
    expect(t.enabled).toBe(true);
    mic.setPushToTalk(false);
    expect(t.enabled).toBe(false);
    mic.setForcePushToTalk(false);
    expect(t.enabled).toBe(true);
  });

  it('reports what is being sent as speaking, and not while muted', async () => {
    const { mic, seen, advance } = setup();
    await mic.start();
    mic.feedLevel(0.3);
    expect(seen.at(-1)).toEqual([0.3, true]);
    advance(500);
    mic.feedLevel(0.001);
    expect(seen.at(-1)).toEqual([0.001, false]);
    mic.setSelfMute(true);
    expect(seen.at(-1)).toEqual([0, false]);
    const before = seen.length;
    mic.feedLevel(0.9);
    expect(seen).toHaveLength(before);
  });

  it('stops the track and the indicator', async () => {
    const { t, mic, seen } = setup();
    await mic.start();
    mic.stop();
    expect(t.stopped).toBe(true);
    expect(seen.at(-1)).toEqual([0, false]);
    mic.feedLevel(0.9);
    expect(seen.at(-1)).toEqual([0, false]);
  });

  it('stops notifying a listener that unsubscribed', async () => {
    const { mic } = setup();
    const listener = jest.fn();
    const off = mic.onLevel(listener);
    await mic.start();
    off();
    mic.feedLevel(0.5);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('MobileMixer', () => {
  it('switches every remote voice off while deafened, and back on', () => {
    const a = track();
    const b = track();
    const mixer = new MobileMixer();
    mixer.setStream('u2', stream(a));
    mixer.setStream('u3', stream(b));
    mixer.setDeafened(true);
    expect([a.enabled, b.enabled, a.volume, b.volume]).toEqual([false, false, 0, 0]);
    mixer.setDeafened(false);
    expect([a.enabled, b.enabled, a.volume, b.volume]).toEqual([true, true, 1, 1]);
  });

  it('applies a person volume times the master volume', () => {
    const a = track();
    const mixer = new MobileMixer();
    mixer.setStream('u2', stream(a));
    mixer.setUserVolume('u2', 0.5);
    mixer.setMasterVolume(0.8);
    expect(a.volume).toBeCloseTo(0.4);
  });

  it('keeps a remembered volume and deafen state for a voice that arrives later', () => {
    const a = track();
    const mixer = new MobileMixer();
    mixer.setUserVolume('u2', 0);
    mixer.setStream('u2', stream(a));
    expect(a.volume).toBe(0);
    mixer.setDeafened(true);
    const late = track();
    mixer.setStream('u3', stream(late));
    expect(late.enabled).toBe(false);
  });

  it('forgets a voice that left', () => {
    const a = track();
    const mixer = new MobileMixer();
    mixer.setStream('u2', stream(a));
    mixer.setStream('u2', null);
    mixer.setDeafened(true);
    expect(a.enabled).toBe(true);
  });
});

describe('AudioRoute', () => {
  const driver = () => ({ start: jest.fn(), stop: jest.fn(), setSpeaker: jest.fn() });

  it('opens the audio session on the loudspeaker when a call begins and closes it when it ends', () => {
    const d = driver();
    const route = new AudioRoute(d);
    route.begin();
    route.begin();
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.setSpeaker).toHaveBeenLastCalledWith(true);
    route.end();
    route.end();
    expect(d.stop).toHaveBeenCalledTimes(1);
  });

  it('switches to the earpiece and back, telling listeners', () => {
    const d = driver();
    const route = new AudioRoute(d);
    const listener = jest.fn();
    route.subscribe(listener);
    route.begin();
    route.toggle();
    expect(route.current).toBe('earpiece');
    expect(d.setSpeaker).toHaveBeenLastCalledWith(false);
    route.toggle();
    expect(route.current).toBe('speaker');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('remembers a choice made before the call and applies it when the call begins', () => {
    const d = driver();
    const route = new AudioRoute(d);
    route.set('earpiece');
    expect(d.setSpeaker).not.toHaveBeenCalled();
    route.begin();
    expect(d.setSpeaker).toHaveBeenCalledWith(false);
  });
});
