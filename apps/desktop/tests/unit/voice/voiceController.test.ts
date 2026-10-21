import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayOp } from '@shared/contracts/gateway';
import { SpeakingFlag } from '@shared/contracts/voice';
import { VoiceController, type VoiceControllerDeps } from '@renderer/application/voice/voiceController';
import type { SessionClosed, SessionStatus, VoiceSessionPort } from '@renderer/application/voice/ports';
import { DEFAULT_PREFS, type PrefsData } from '@renderer/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useLocalPeopleStore } from '@renderer/application/stores/localPeopleStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { presetConstraints } from '@renderer/domain/videoPresets';

class FakeSession implements VoiceSessionPort {
  region = 'eu';
  connect = vi.fn();
  close = vi.fn();
  setSpeaking = vi.fn();
  setMicTrack = vi.fn(async () => undefined);
  setCameraTrack = vi.fn(async () => undefined);
  setScreenTrack = vi.fn(async () => undefined);
  applyScreenParameters = vi.fn(async () => undefined);
  setSinkWants = vi.fn();
  collectStats = vi.fn(async () => ({ rttMs: 40, jitterMs: 3, lossPct: 0.5, bitrateKbps: 64 }));
  status: ((s: SessionStatus) => void)[] = [];
  closed: ((c: SessionClosed) => void)[] = [];
  e2ee: ((a: boolean) => void)[] = [];
  audio: ((u: string, s: MediaStream | null) => void)[] = [];
  onStatus(l: (s: SessionStatus) => void) {
    this.status.push(l);
    return () => undefined;
  }
  onClosed(l: (c: SessionClosed) => void) {
    this.closed.push(l);
    return () => undefined;
  }
  onE2ee(l: (a: boolean) => void) {
    this.e2ee.push(l);
    return () => undefined;
  }
  onRemoteAudio(l: (u: string, s: MediaStream | null) => void) {
    this.audio.push(l);
    return () => undefined;
  }
}

function setup(prefsOver: Partial<PrefsData> = {}) {
  const sent: { op: number; d: Record<string, unknown> }[] = [];
  const sessions: FakeSession[] = [];
  let level: ((l: number, t: boolean) => void) | null = null;
  const mic = {
    start: vi.fn(async () => ({ kind: 'audio' }) as MediaStreamTrack),
    stop: vi.fn(),
    setSelfMute: vi.fn(),
    setSoundshare: vi.fn(),
    reconfigure: vi.fn(async () => null),
    onLevel: vi.fn((l: (lv: number, t: boolean) => void) => {
      level = l;
      return () => undefined;
    }),
  };
  const cameraTrack = { getSettings: () => ({}), applyConstraints: vi.fn(async () => undefined) };
  const openCamera = vi.fn(async () => ({ getVideoTracks: () => [cameraTrack], getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream);
  const mixer = {
    setStream: vi.fn(),
    setUserVolume: vi.fn(),
    setMasterVolume: vi.fn(),
    setDeafened: vi.fn(),
    setOutputDevice: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
  let prefs: PrefsData = { ...DEFAULT_PREFS, ...prefsOver };
  const listeners: ((s: PrefsData, p: PrefsData) => void)[] = [];
  const deps: VoiceControllerDeps = {
    gateway: { send: (op, d) => sent.push({ op, d: d as Record<string, unknown> }) },
    createSession: () => {
      const s = new FakeSession();
      sessions.push(s);
      return s;
    },
    mic,
    mixer,
    openCamera,
    screen: {
      capture: { listSources: vi.fn(async () => []), select: vi.fn(async () => undefined) },
      getDisplayMedia: vi.fn(),
      platform: 'win32',
      createSampler: () => ({ sample: async () => null, dispose: () => undefined }),
    },
    prefs: { get: () => prefs, subscribe: (l) => (listeners.push(l), () => undefined) },
    telemetryMs: 5000,
    serverUpdateTimeoutMs: 15000,
  };
  const controller = new VoiceController(deps);
  return {
    controller,
    sent,
    sessions,
    mic,
    mixer,
    openCamera,
    cameraTrack,
    emitLevel: (l: number, t: boolean) => level?.(l, t),
    changePrefs: (patch: Partial<PrefsData>) => {
      const previous = prefs;
      prefs = { ...prefs, ...patch };
      listeners.forEach((l) => l(prefs, previous));
    },
  };
}

const update = { token: 'tok', guild_id: 'g1', channel_id: 'c1', endpoint: 'rtc.test', region: 'eu' };

beforeEach(() => {
  vi.useFakeTimers();
  useVoiceStore.getState().resetCall();
  useVoiceStore.setState({ selfMute: false, selfDeaf: false, userVolumes: {}, speaking: {}, localCamera: null, localScreen: null });
  useSessionStore.setState({ user: { id: 'me', username: 'me', global_name: null, avatar: null }, sessionId: 'sess' });
});
afterEach(() => vi.useRealTimers());

describe('VoiceController', () => {
  it('joins: starts the mic, sends op 4, then opens a session when the server is allocated', async () => {
    const { controller, sent, sessions, mic } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    expect(mic.start).toHaveBeenCalled();
    expect(sent).toEqual([{ op: GatewayOp.VOICE_STATE_UPDATE, d: { guild_id: 'g1', channel_id: 'c1', self_mute: false, self_deaf: false, self_video: false, self_stream: false } }]);
    expect(useVoiceStore.getState().call.status).toBe('connecting');
    expect(sessions).toHaveLength(0);

    controller.onVoiceServerUpdate(update);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.connect).toHaveBeenCalled();
    expect(sessions[0]!.setMicTrack).toHaveBeenCalled();
    sessions[0]!.status.forEach((l) => l('connected'));
    expect(useVoiceStore.getState().call).toMatchObject({ status: 'connected', region: 'eu', channelId: 'c1' });
  });

  it('ignores server updates for other channels and times out without one', async () => {
    const { controller, sessions, sent } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate({ ...update, channel_id: 'other' });
    expect(sessions).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(useVoiceStore.getState().call).toMatchObject({ status: 'failed', error: 'The voice server did not respond' });
    expect(sent.at(-1)?.d.channel_id).toBeNull();
  });

  it('leaves synchronously when the window unloads, and only once', async () => {
    const { controller, sessions, sent } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    const before = sent.length;
    controller.leaveOnUnload();
    expect(sent.at(-1)).toMatchObject({ op: GatewayOp.VOICE_STATE_UPDATE, d: { channel_id: null } });
    expect(sessions[0]?.close).toHaveBeenCalled();
    controller.leaveOnUnload();
    expect(sent).toHaveLength(before + 1);
  });

  it('reallocates onto a new node, keeping the call target', async () => {
    const { controller, sessions } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    controller.onVoiceServerUpdate({ ...update, endpoint: 'rtc2.test', region: 'us' });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.close).toHaveBeenCalled();
    expect(useVoiceStore.getState().call.region).toBe('us');
    expect(useVoiceStore.getState().call.status).toBe('reconnecting');
  });

  describe('moderator move and disconnect', () => {
    const selfState = { guild_id: 'g1', channel_id: null, user_id: 'me', session_id: 'sess', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false };

    it('follows a server-driven move: new token, new target, no gateway echo', async () => {
      const { controller, sessions, sent } = setup();
      await controller.join({ guildId: 'g1', channelId: 'c1' });
      controller.onVoiceServerUpdate(update);
      const before = sent.length;
      controller.onVoiceServerUpdate({ ...update, channel_id: 'c2', token: 'tok2' });
      expect(sessions).toHaveLength(2);
      expect(sessions[0]!.close).toHaveBeenCalled();
      expect(useVoiceStore.getState().call).toMatchObject({ channelId: 'c2' });
      expect(sent).toHaveLength(before);
      await controller.leave();
      expect(sent.at(-1)?.d).toMatchObject({ guild_id: null, channel_id: null });
    });

    it('ignores an update for another guild or for a channel while no session exists yet', async () => {
      const { controller, sessions } = setup();
      await controller.join({ guildId: 'g1', channelId: 'c1' });
      controller.onVoiceServerUpdate({ ...update, channel_id: 'c2' });
      expect(sessions).toHaveLength(0);
      controller.onVoiceServerUpdate(update);
      controller.onVoiceServerUpdate({ ...update, guild_id: 'other', channel_id: 'c2' });
      expect(sessions).toHaveLength(1);
      expect(useVoiceStore.getState().call.channelId).toBe('c1');
    });

    it('leaves quietly when a moderator disconnects us', async () => {
      const { controller, sessions, sent, mic } = setup();
      await controller.join({ guildId: 'g1', channelId: 'c1' });
      controller.onVoiceServerUpdate(update);
      const before = sent.length;
      controller.onVoiceState(selfState);
      await vi.advanceTimersByTimeAsync(5);
      expect(sessions[0]!.close).toHaveBeenCalled();
      expect(mic.stop).toHaveBeenCalled();
      expect(sent).toHaveLength(before);
      expect(useVoiceStore.getState().call.status).toBe('idle');
    });

    it('does not react to other users, other sessions, other scopes or a refused join', async () => {
      const { controller, sessions } = setup();
      await controller.join({ guildId: 'g1', channelId: 'c1' });
      controller.onVoiceState(selfState);
      expect(useVoiceStore.getState().call.status).toBe('connecting');
      controller.onVoiceServerUpdate(update);
      controller.onVoiceState({ ...selfState, user_id: 'someone' });
      controller.onVoiceState({ ...selfState, session_id: 'other-device' });
      controller.onVoiceState({ ...selfState, guild_id: 'g2' });
      controller.onVoiceState({ ...selfState, channel_id: 'c1' });
      await vi.advanceTimersByTimeAsync(5);
      expect(sessions[0]!.close).not.toHaveBeenCalled();
    });
  });

  it('reports e2ee only as the session reports it', async () => {
    const { controller, sessions } = setup();
    await controller.join({ guildId: null, channelId: 'dm1' });
    controller.onVoiceServerUpdate({ ...update, guild_id: null, channel_id: 'dm1' });
    expect(useVoiceStore.getState().call.e2ee).toBe(false);
    sessions[0]!.e2ee.forEach((l) => l(true));
    expect(useVoiceStore.getState().call.e2ee).toBe(true);
    sessions[0]!.e2ee.forEach((l) => l(false));
    expect(useVoiceStore.getState().call.e2ee).toBe(false);
  });

  it('mute and deafen send op 4 and deafen restores the previous mute state', async () => {
    const { controller, sent, mic, mixer } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.toggleMute();
    expect(mic.setSelfMute).toHaveBeenLastCalledWith(true);
    expect(sent.at(-1)?.d).toMatchObject({ self_mute: true, self_deaf: false });
    controller.setMute(false);
    controller.setDeaf(true);
    expect(mixer.setDeafened).toHaveBeenLastCalledWith(true);
    expect(sent.at(-1)?.d).toMatchObject({ self_mute: true, self_deaf: true });
    controller.setDeaf(false);
    expect(sent.at(-1)?.d).toMatchObject({ self_mute: false, self_deaf: false });
    expect(mixer.setDeafened).toHaveBeenLastCalledWith(false);
  });

  it('unmuting while deafened also undeafens', async () => {
    const { controller } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.setDeaf(true);
    controller.setMute(false);
    expect(useVoiceStore.getState().selfDeaf).toBe(false);
    expect(useVoiceStore.getState().selfMute).toBe(false);
  });

  it('announces speaking flags from the mic and updates the local speaking level', async () => {
    const { controller, sessions, emitLevel } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    emitLevel(0.6, true);
    expect(sessions[0]!.setSpeaking).toHaveBeenLastCalledWith(SpeakingFlag.MICROPHONE);
    expect(useVoiceStore.getState().speaking.me).toBe(0.6);
    emitLevel(0, false);
    expect(sessions[0]!.setSpeaking).toHaveBeenLastCalledWith(0);
    expect(useVoiceStore.getState().speaking.me).toBe(0);
  });

  it('per-user volume reaches the mixer, is clamped to 200 percent and applied to new streams', async () => {
    const { controller, sessions, mixer } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    controller.setUserVolume('u2', 3);
    expect(mixer.setUserVolume).toHaveBeenLastCalledWith('u2', 2);
    const stream = {} as MediaStream;
    sessions[0]!.audio.forEach((l) => l('u2', stream));
    expect(mixer.setStream).toHaveBeenCalledWith('u2', stream);
  });

  it('plays a new remote stream at full volume by default (no stored volume, no stored mute)', async () => {
    const { controller, sessions, mixer } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    sessions[0]!.audio.forEach((l) => l('u9', {} as MediaStream));
    expect(mixer.setUserVolume).not.toHaveBeenCalled();
    expect(mixer.setStream).toHaveBeenCalledTimes(1);
    expect(useVoiceStore.getState().userVolumes.u9).toBeUndefined();
  });

  it('keeps a persisted local mute across sessions and leaves everyone else audible', async () => {
    useLocalPeopleStore.setState({ mutedUsers: { u2: 1 } });
    const { controller, sessions, mixer } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    sessions[0]!.audio.forEach((l) => {
      l('u2', {} as MediaStream);
      l('u3', {} as MediaStream);
    });
    expect(mixer.setUserVolume).toHaveBeenCalledTimes(1);
    expect(mixer.setUserVolume).toHaveBeenCalledWith('u2', 0);
    useLocalPeopleStore.setState({ mutedUsers: {} });
  });

  it('publishes telemetry every five seconds', async () => {
    const { controller, sent } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.at(-1)).toEqual({ op: GatewayOp.VOICE_TELEMETRY, d: { channel_id: 'c1', jitter_ms: 3, loss_pct: 0.5, rtt_ms: 40, bitrate_kbps: 64 } });
    expect(useVoiceStore.getState().call.quality?.rttMs).toBe(40);
  });

  it('turns the camera on and off with op 4 updates', async () => {
    const { controller, sessions, sent } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    await controller.setVideo(true);
    expect(sessions[0]!.setCameraTrack).toHaveBeenCalled();
    expect(sent.at(-1)?.d.self_video).toBe(true);
    await controller.setVideo(false);
    expect(sessions[0]!.setCameraTrack).toHaveBeenLastCalledWith(null);
    expect(sent.at(-1)?.d.self_video).toBe(false);
  });

  it('opens the camera with the chosen quality preset and sends matching sender parameters', async () => {
    const { controller, sessions, openCamera } = setup({ cameraPreset: '1440p60' });
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    await controller.setVideo(true);
    expect(openCamera).toHaveBeenCalledWith(null, '1440p60');
    expect(sessions[0]!.setCameraTrack).toHaveBeenLastCalledWith(expect.anything(), presetConstraints('1440p60'));
  });

  it('re-applies the camera preset to the live track when it changes', async () => {
    const { controller, sessions, cameraTrack, changePrefs } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    await controller.setVideo(true);
    changePrefs({ cameraPreset: '2160p60' });
    await vi.advanceTimersByTimeAsync(1);
    expect(cameraTrack.applyConstraints).toHaveBeenLastCalledWith({ width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 60 } });
    expect(sessions[0]!.setCameraTrack).toHaveBeenLastCalledWith(cameraTrack, presetConstraints('2160p60'));
  });

  it('does not touch the camera when the preset changes while it is off', async () => {
    const { controller, sessions, cameraTrack, changePrefs } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    changePrefs({ cameraPreset: '2160p30' });
    await vi.advanceTimersByTimeAsync(1);
    expect(cameraTrack.applyConstraints).not.toHaveBeenCalled();
    expect(sessions[0]!.setCameraTrack).not.toHaveBeenCalled();
  });

  it('applies device preference changes: output device, volume and mic restart', async () => {
    const { controller, mixer, mic, sessions, changePrefs } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    const next = { kind: 'audio', id: 'new' } as unknown as MediaStreamTrack;
    mic.reconfigure.mockResolvedValueOnce(next as never);
    changePrefs({ outputDeviceId: 'spk', outputVolume: 0.5, inputDeviceId: 'mic2' });
    await vi.advanceTimersByTimeAsync(1);
    expect(mixer.setOutputDevice).toHaveBeenLastCalledWith('spk');
    expect(mixer.setMasterVolume).toHaveBeenLastCalledWith(0.5);
    expect(sessions[0]!.setMicTrack).toHaveBeenLastCalledWith(next);
  });

  it('leave clears the call, tells the gateway and stops the mic', async () => {
    const { controller, sent, mic, sessions } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    await controller.leave();
    expect(sessions[0]!.close).toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();
    expect(sent.at(-1)?.d).toMatchObject({ guild_id: null, channel_id: null });
    expect(useVoiceStore.getState().call.status).toBe('idle');
  });

  it('a fatal session close ends the call with the reason', async () => {
    const { controller, sessions } = setup();
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    controller.onVoiceServerUpdate(update);
    sessions[0]!.closed.forEach((l) => l({ fatal: true, reason: 'auth failed' }));
    await vi.advanceTimersByTimeAsync(5);
    expect(useVoiceStore.getState().call).toMatchObject({ status: 'failed', error: 'auth failed' });
  });

  it('fails cleanly when the microphone cannot be opened', async () => {
    const { controller, mic, sent } = setup();
    mic.start.mockRejectedValueOnce(new Error('Permission denied'));
    await controller.join({ guildId: 'g1', channelId: 'c1' });
    expect(useVoiceStore.getState().call).toMatchObject({ status: 'failed', error: 'Permission denied' });
    expect(sent.at(-1)?.d.channel_id).toBeNull();
  });
});
