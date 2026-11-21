import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, type PrefsData } from '@discordy/core/application/stores/prefsStore';
import { MicPipeline } from '@renderer/infrastructure/audio/micPipeline';
import { RemoteAudioMixer } from '@renderer/infrastructure/audio/remoteAudioMixer';

class FakeNode {
  gain = { value: 1, setTargetAtTime: vi.fn((v: number) => (this.gain.value = v)) };
  fftSize = 1024;
  connections: unknown[] = [];
  samples = 0;
  stream = { getAudioTracks: () => [{ kind: 'audio', stop: vi.fn() }] };
  connect(node: unknown) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.connections = [];
  }
  getFloatTimeDomainData(buffer: Float32Array) {
    buffer.fill(this.samples);
  }
}

function fakeContext() {
  const nodes: FakeNode[] = [];
  const make = () => {
    const n = new FakeNode();
    nodes.push(n);
    return n;
  };
  const context = {
    currentTime: 0,
    state: 'running',
    destination: make(),
    audioWorklet: { addModule: vi.fn(async () => undefined) },
    createMediaStreamSource: make,
    createGain: make,
    createAnalyser: make,
    createMediaStreamDestination: make,
    setSinkId: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
  };
  return { context: context as unknown as AudioContext, nodes };
}

describe('MicPipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        connect() {}
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(prefs: Partial<PrefsData> = {}) {
    const { context, nodes } = fakeContext();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream);
    let ptt: ((pressed: boolean) => void) | null = null;
    const current: PrefsData = { ...DEFAULT_PREFS, ...prefs };
    const setPushToTalkKey = vi.fn(async () => true);
    const mic = new MicPipeline({
      prefs: () => current,
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
      createContext: () => context,
      rnnoiseModuleUrl: '/rnnoise.js',
      onPushToTalk: (l) => {
        ptt = l;
        return () => undefined;
      },
      setPushToTalkKey,
      now: () => Date.now(),
    });
    return { mic, getUserMedia, nodes, context, current, setPushToTalkKey, press: (p: boolean) => ptt?.(p) };
  }

  it('captures with the preference constraints and loads the RNNoise worklet', async () => {
    const { mic, getUserMedia, context } = setup({ inputDeviceId: 'mic-1', noiseSuppression: true, echoCancellation: false, autoGain: true });
    await mic.start();
    const constraints = (getUserMedia.mock.calls[0] as unknown as [MediaStreamConstraints])[0];
    expect(constraints.audio).toMatchObject({ deviceId: { exact: 'mic-1' }, echoCancellation: false, noiseSuppression: true, autoGainControl: true });
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith('/rnnoise.js');
    mic.stop();
  });

  it('skips the worklet when noise suppression is off', async () => {
    const { mic, context } = setup({ noiseSuppression: false });
    await mic.start();
    expect(context.audioWorklet.addModule).not.toHaveBeenCalled();
    mic.stop();
  });

  it('opens the gate on loud input (VAD) and self-mute closes it', async () => {
    const { mic, nodes } = setup({ inputMode: 'vad', vadThreshold: 0.3 });
    const levels: [number, boolean][] = [];
    mic.onLevel((l, t) => levels.push([l, t]));
    await mic.start();
    const analyser = nodes[3]!;
    analyser.samples = 0.2;
    await vi.advanceTimersByTimeAsync(40);
    expect(levels.at(-1)?.[1]).toBe(true);
    mic.setSelfMute(true);
    await vi.advanceTimersByTimeAsync(40);
    expect(levels.at(-1)?.[1]).toBe(false);
    mic.stop();
  });

  it('push-to-talk transmits only while held, with the release delay', async () => {
    const { mic, nodes, press, setPushToTalkKey } = setup({ inputMode: 'ptt', pttKeycode: 29, pttReleaseDelayMs: 200 });
    const levels: [number, boolean][] = [];
    mic.onLevel((l, t) => levels.push([l, t]));
    await mic.start();
    expect(setPushToTalkKey).toHaveBeenCalledWith(29);
    nodes[3]!.samples = 0.5;
    await vi.advanceTimersByTimeAsync(40);
    expect(levels.at(-1)?.[1]).toBe(false);
    press(true);
    await vi.advanceTimersByTimeAsync(40);
    expect(levels.at(-1)?.[1]).toBe(true);
    press(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(levels.at(-1)?.[1]).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(levels.at(-1)?.[1]).toBe(false);
    mic.stop();
  });

  it('forces PTT without changing the saved VAD preference', async () => {
    const { mic, nodes, press, current } = setup({ inputMode: 'vad', vadThreshold: 0.3, pttReleaseDelayMs: 0 });
    const levels: boolean[] = [];
    mic.onLevel((_level, transmitting) => levels.push(transmitting));
    await mic.start();
    nodes[3]!.samples = 0.5;
    await vi.advanceTimersByTimeAsync(40);
    expect(levels.at(-1)).toBe(true);
    mic.setForcePushToTalk(true);
    await vi.advanceTimersByTimeAsync(40);
    expect(levels.at(-1)).toBe(false);
    press(true);
    await vi.advanceTimersByTimeAsync(40);
    expect(levels.at(-1)).toBe(true);
    expect(current.inputMode).toBe('vad');
    mic.stop();
  });

  it('reconfigure restarts capture only when device constraints changed', async () => {
    const { mic, getUserMedia, current } = setup();
    await mic.start();
    expect(await mic.reconfigure()).toBeNull();
    current.inputDeviceId = 'other';
    expect(await mic.reconfigure()).not.toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    mic.stop();
  });
});

describe('RemoteAudioMixer', () => {
  function setup() {
    const { context, nodes } = fakeContext();
    const mixer = new RemoteAudioMixer({
      createContext: () => context,
      createElement: () => ({ muted: false, srcObject: null, play: vi.fn(async () => undefined) }) as unknown as HTMLAudioElement,
    });
    return { mixer, nodes, context };
  }
  const stream = {} as MediaStream;

  it('applies per-user gain up to 200 percent and clamps beyond', () => {
    const { mixer, nodes } = setup();
    mixer.setStream('u1', stream);
    const userGain = nodes[nodes.length - 1]!; // created last
    mixer.setUserVolume('u1', 1.5);
    expect(userGain.gain.value).toBe(1.5);
    mixer.setUserVolume('u1', 5);
    expect(userGain.gain.value).toBe(2);
    mixer.setUserVolume('u1', -1);
    expect(userGain.gain.value).toBe(0);
  });

  it('remembers volume set before the stream arrives', () => {
    const { mixer, nodes } = setup();
    mixer.setUserVolume('u1', 0.5);
    mixer.setStream('u1', stream);
    expect(nodes[nodes.length - 1]!.gain.value).toBe(0.5);
  });

  it('deafen silences the master and restores the output volume', () => {
    const { mixer, nodes } = setup();
    mixer.setStream('u1', stream);
    const master = nodes.find((n) => n.connections.length > 0 && n.gain.value === 1)!;
    mixer.setMasterVolume(0.8);
    mixer.setDeafened(true);
    expect(master.gain.value).toBe(0);
    mixer.setDeafened(false);
    expect(master.gain.value).toBe(0.8);
  });

  it('routes output to the chosen device', async () => {
    const { mixer, context } = setup();
    mixer.setStream('u1', stream);
    await mixer.setOutputDevice('speakers');
    expect((context as unknown as { setSinkId: unknown }).setSinkId).toHaveBeenCalledWith('speakers');
  });

  it('removes a voice when its stream ends', () => {
    const { mixer, nodes } = setup();
    mixer.setStream('u1', stream);
    const source = nodes[2]!;
    mixer.setStream('u1', null);
    expect(source.connections).toEqual([]);
  });
});
