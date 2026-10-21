/**
 * Orchestrates a voice call: gateway op 4 / VOICE_SERVER_UPDATE handshake, the
 * voice session, mic and playback, camera, screen share, telemetry and device
 * changes. The dispatch router forwards VOICE_SERVER_UPDATE to
 * `onVoiceServerUpdate`.
 */
import { GatewayOp, type VoiceServerUpdate, type VoiceStateUpdatePayload, type VoiceTelemetry } from '@shared/contracts/gateway';
import type { VoiceState } from '@shared/contracts/rest';
import { SpeakingFlag, type MediaSinkWants } from '@shared/contracts/voice';
import { cameraCaptureConstraints, presetConstraints, type VideoPresetId } from '@renderer/domain/videoPresets';
import { usePrefsStore, type PrefsData } from '@renderer/application/stores/prefsStore';
import { useLocalPeopleStore } from '@renderer/application/stores/localPeopleStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import type { GatewayPort } from '@renderer/application/ports/gateway';
import type { MicPort, MixerPort, ScreenTrackOptions, VoiceSessionPort } from './ports';
import { ScreenShare, type ScreenShareDeps, type ScreenShareHost, type StartScreenShare, type ScreenShareOutcome } from './screenShare';

export interface SessionParams {
  endpoint: string;
  region: string;
  serverId: string;
  userId: string;
  sessionId: string;
  token: string;
}

export interface VoiceControllerDeps {
  gateway: Pick<GatewayPort, 'send'>;
  createSession(params: SessionParams): VoiceSessionPort;
  mic: MicPort;
  mixer: MixerPort;
  openCamera(deviceId: string | null, preset: VideoPresetId): Promise<MediaStream>;
  screen: Omit<ScreenShareDeps, 'host'>;
  prefs?: { get(): PrefsData; subscribe(listener: (state: PrefsData, previous: PrefsData) => void): () => void };
  telemetryMs?: number;
  serverUpdateTimeoutMs?: number;
}

export interface JoinTarget {
  guildId: string | null;
  channelId: string;
}

const DEVICE_KEYS = ['inputDeviceId', 'outputDeviceId', 'cameraDeviceId', 'noiseSuppression', 'echoCancellation', 'autoGain', 'inputMode', 'vadThreshold', 'pttKeycode', 'pttReleaseDelayMs', 'inputVolume', 'outputVolume'] as const;

export class VoiceController {
  private session: VoiceSessionPort | null = null;
  private target: JoinTarget | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private sessionDisposers: (() => void)[] = [];
  private disposers: (() => void)[] = [];
  private transmitting = false;
  private soundshare = false;
  private mutedBeforeDeafen = false;
  private readonly screenShare: ScreenShare;
  private joinToken = 0;

  constructor(private readonly deps: VoiceControllerDeps) {
    const host: ScreenShareHost = {
      attach: async (track, options, audio) => {
        await this.session?.setScreenTrack(track, options);
        this.deps.mic.setSoundshare(audio);
        this.soundshare = audio !== null;
        this.pushSpeaking();
      },
      applyParameters: async (constraints) => {
        await this.session?.applyScreenParameters(constraints);
      },
      detach: async () => {
        await this.session?.setScreenTrack(null);
        this.deps.mic.setSoundshare(null);
        this.soundshare = false;
        this.pushSpeaking();
      },
    };
    this.screenShare = new ScreenShare({ ...deps.screen, host });
    this.screenShare.onEnded(() => this.sendState());

    this.deps.mic.onLevel((level, transmitting) => {
      const self = useSessionStore.getState().user?.id;
      if (self) useVoiceStore.getState().setSpeaking(self, transmitting ? Math.max(level, 0.05) : 0);
      if (transmitting !== this.transmitting) {
        this.transmitting = transmitting;
        this.pushSpeaking();
      }
    });
    const prefs = deps.prefs ?? {
      get: () => usePrefsStore.getState(),
      subscribe: (l: (s: PrefsData, p: PrefsData) => void) => usePrefsStore.subscribe(l),
    };
    this.disposers.push(
      prefs.subscribe((state, previous) => {
        if (DEVICE_KEYS.some((k) => state[k] !== previous[k])) void this.refreshDevices();
        if (state.cameraPreset !== previous.cameraPreset) void this.applyCameraPreset();
      }),
    );
  }

  private prefs(): PrefsData {
    return this.deps.prefs?.get() ?? usePrefsStore.getState();
  }

  // ---- join / leave ------------------------------------------------------

  async join(target: JoinTarget): Promise<void> {
    if (this.target) await this.leave();
    const token = ++this.joinToken;
    const store = useVoiceStore.getState();
    this.target = target;
    store.setCall({ status: 'requesting', guildId: target.guildId, channelId: target.channelId, error: null, e2ee: false, quality: null });
    try {
      this.micTrack = await this.deps.mic.start();
      if (token !== this.joinToken) return;
      this.deps.mic.setSelfMute(useVoiceStore.getState().selfMute);
      this.deps.mixer.setDeafened(useVoiceStore.getState().selfDeaf);
      this.deps.mixer.setMasterVolume(this.prefs().outputVolume);
      await this.deps.mixer.setOutputDevice(this.prefs().outputDeviceId).catch(() => undefined);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Microphone unavailable');
      return;
    }
    useVoiceStore.getState().setCall({ status: 'connecting' });
    this.sendState();
    this.waitTimer = setTimeout(() => {
      if (!this.session) this.fail('The voice server did not respond');
    }, this.deps.serverUpdateTimeoutMs ?? 15_000);
  }

  async leave(): Promise<void> {
    await this.teardown(true);
  }

  /** `announce` tells the gateway; a server-driven disconnect already left, so it stays quiet. */
  private async teardown(announce: boolean): Promise<void> {
    this.joinToken += 1;
    const wasInCall = this.target !== null;
    const target = this.target;
    this.clearWait();
    await this.screenShare.stop();
    await this.stopCamera();
    this.closeSession();
    this.deps.mic.stop();
    this.target = null;
    if (announce && wasInCall && target) {
      this.deps.gateway.send(GatewayOp.VOICE_STATE_UPDATE, this.statePayload(null));
    }
    useVoiceStore.getState().resetCall();
  }

  /**
   * Dispatch hook: our own VOICE_STATE_UPDATE. `channel_id: null` while connected means a moderator
   * disconnected us (a refused join arrives before any session exists and is left to the timeout).
   */
  onVoiceState(state: VoiceState): void {
    const target = this.target;
    const { user, sessionId } = useSessionStore.getState();
    if (!target || !this.session || !user || state.user_id !== user.id) return;
    if (state.channel_id !== null || state.session_id !== sessionId) return;
    if ((state.guild_id ?? null) !== target.guildId) return;
    void this.teardown(false).then(() =>
      useUiStore.getState().toast({ tone: 'info', title: 'You were disconnected from voice' }),
    );
  }

  /**
   * Leaves synchronously while the window unloads, where `leave()`'s awaits never finish: tells the
   * gateway first so the call does not linger with a ghost participant, then closes the session.
   */
  leaveOnUnload(): void {
    if (!this.target) return;
    this.deps.gateway.send(GatewayOp.VOICE_STATE_UPDATE, this.statePayload(null));
    this.joinToken += 1;
    this.clearWait();
    this.closeSession();
    this.target = null;
  }

  /** Dispatch hook: gateway VOICE_SERVER_UPDATE (initial allocation or reallocation). */
  onVoiceServerUpdate(update: VoiceServerUpdate): void {
    const target = this.target;
    if (!target) return;
    if (update.channel_id !== target.channelId) {
      // A moderator moved us: the gateway re-homes the session and sends a token for the new
      // channel. Only a connected call follows it, so a stale update for a channel we just left
      // (while the next join is still waiting for its server) is still ignored.
      if (!this.session || update.guild_id !== target.guildId) return;
      this.target = { ...target, channelId: update.channel_id };
      useVoiceStore.getState().setCall({ channelId: update.channel_id });
    }
    const { user, sessionId } = useSessionStore.getState();
    if (!user || !sessionId) {
      this.fail('Not signed in to the gateway');
      return;
    }
    this.clearWait();
    const reallocating = this.session !== null;
    this.closeSession();
    if (reallocating) useVoiceStore.getState().setCall({ status: 'reconnecting' });
    const session = this.deps.createSession({
      endpoint: update.endpoint,
      region: update.region,
      serverId: update.guild_id ?? update.channel_id,
      userId: user.id,
      sessionId,
      token: update.token,
    });
    this.session = session;
    useVoiceStore.getState().setCall({ region: update.region });
    this.sessionDisposers = [
      session.onStatus((status) => {
        if (status === 'connected') useVoiceStore.getState().setCall({ status: 'connected', error: null });
        else if (status === 'connecting') useVoiceStore.getState().setCall({ status: 'connecting' });
        else if (status === 'reconnecting') useVoiceStore.getState().setCall({ status: 'reconnecting' });
      }),
      session.onClosed((info) => {
        if (info.fatal) void this.leave().then(() => useVoiceStore.getState().setCall({ status: 'failed', error: info.reason }));
      }),
      session.onE2ee((active) => useVoiceStore.getState().setCall({ e2ee: active })),
      session.onRemoteAudio((userId, stream) => {
        // A local mute outlives the session (it is persisted); the in-memory volume does not, so honour it here.
        const muted = userId in useLocalPeopleStore.getState().mutedUsers;
        const volume = useVoiceStore.getState().userVolumes[userId] ?? (muted ? 0 : undefined);
        if (volume !== undefined) this.deps.mixer.setUserVolume(userId, volume);
        this.deps.mixer.setStream(userId, stream);
      }),
    ];
    if (this.micTrack) void session.setMicTrack(this.micTrack);
    session.connect();
    void this.restoreLocalMedia(session);
    this.telemetryTimer = setInterval(() => void this.reportTelemetry(), this.deps.telemetryMs ?? 5000);
  }

  private async restoreLocalMedia(session: VoiceSessionPort): Promise<void> {
    const camera = useVoiceStore.getState().localCamera?.getVideoTracks()[0];
    if (camera) await session.setCameraTrack(camera, presetConstraints(this.prefs().cameraPreset));
    const screen = useVoiceStore.getState().localScreen?.getVideoTracks()[0];
    if (screen) {
      const options: ScreenTrackOptions = { constraints: presetConstraints(this.screenShare.currentPreset), contentHint: 'motion' };
      await session.setScreenTrack(screen, options);
    }
  }

  private closeSession(): void {
    for (const dispose of this.sessionDisposers) dispose();
    this.sessionDisposers = [];
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.telemetryTimer = null;
    this.session?.close();
    this.session = null;
  }

  private clearWait(): void {
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.waitTimer = null;
  }

  private fail(message: string): void {
    const send = this.target !== null;
    this.joinToken += 1;
    this.clearWait();
    this.closeSession();
    this.deps.mic.stop();
    this.target = null;
    if (send) this.deps.gateway.send(GatewayOp.VOICE_STATE_UPDATE, this.statePayload(null));
    useVoiceStore.getState().resetCall();
    useVoiceStore.getState().setCall({ status: 'failed', error: message });
  }

  // ---- state -------------------------------------------------------------

  private statePayload(target: JoinTarget | null): VoiceStateUpdatePayload {
    const s = useVoiceStore.getState();
    return {
      guild_id: target?.guildId ?? null,
      channel_id: target?.channelId ?? null,
      self_mute: s.selfMute,
      self_deaf: s.selfDeaf,
      self_video: s.selfVideo,
      self_stream: s.selfStream,
    };
  }

  private sendState(): void {
    if (this.target) this.deps.gateway.send(GatewayOp.VOICE_STATE_UPDATE, this.statePayload(this.target));
  }

  private pushSpeaking(): void {
    const flags = (this.transmitting ? SpeakingFlag.MICROPHONE : 0) | (this.soundshare ? SpeakingFlag.SOUNDSHARE : 0);
    this.session?.setSpeaking(flags);
  }

  setMute(muted: boolean): void {
    const store = useVoiceStore.getState();
    if (!muted && store.selfDeaf) this.setDeaf(false);
    useVoiceStore.getState().setSelf({ selfMute: muted });
    this.deps.mic.setSelfMute(muted);
    this.sendState();
  }

  toggleMute(): void {
    this.setMute(!useVoiceStore.getState().selfMute);
  }

  setDeaf(deaf: boolean): void {
    const store = useVoiceStore.getState();
    if (deaf === store.selfDeaf) return;
    if (deaf) {
      this.mutedBeforeDeafen = store.selfMute;
      store.setSelf({ selfDeaf: true, selfMute: true });
      this.deps.mic.setSelfMute(true);
    } else {
      store.setSelf({ selfDeaf: false, selfMute: this.mutedBeforeDeafen });
      this.deps.mic.setSelfMute(this.mutedBeforeDeafen);
    }
    this.deps.mixer.setDeafened(deaf);
    this.sendState();
  }

  toggleDeaf(): void {
    this.setDeaf(!useVoiceStore.getState().selfDeaf);
  }

  setUserVolume(userId: string, volume: number): void {
    useVoiceStore.getState().setUserVolume(userId, volume);
    this.deps.mixer.setUserVolume(userId, useVoiceStore.getState().userVolumes[userId] ?? 1);
  }

  setSinkWants(wants: MediaSinkWants): void {
    this.session?.setSinkWants(wants);
  }

  // ---- camera ------------------------------------------------------------

  async setVideo(enabled: boolean): Promise<void> {
    if (!enabled) {
      await this.stopCamera();
      this.sendState();
      return;
    }
    const { cameraDeviceId, cameraPreset } = this.prefs();
    const stream = await this.deps.openCamera(cameraDeviceId, cameraPreset);
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('camera produced no video track');
    await this.session?.setCameraTrack(track, presetConstraints(cameraPreset));
    useVoiceStore.getState().setLocalMedia({ localCamera: stream });
    useVoiceStore.getState().setSelf({ selfVideo: true });
    this.sendState();
  }

  /** Re-applies the camera quality preset to the live track and the sender. */
  private async applyCameraPreset(): Promise<void> {
    const track = useVoiceStore.getState().localCamera?.getVideoTracks()[0];
    if (!track) return;
    const preset = this.prefs().cameraPreset;
    await track.applyConstraints(cameraCaptureConstraints(preset)).catch(() => undefined);
    await this.session?.setCameraTrack(track, presetConstraints(preset));
  }

  private async stopCamera(): Promise<void> {
    const camera = useVoiceStore.getState().localCamera;
    if (!camera && !useVoiceStore.getState().selfVideo) return;
    for (const track of camera?.getTracks() ?? []) track.stop();
    await this.session?.setCameraTrack(null);
    useVoiceStore.getState().setLocalMedia({ localCamera: null });
    useVoiceStore.getState().setSelf({ selfVideo: false });
  }

  // ---- screen share ------------------------------------------------------

  listCaptureSources(): ReturnType<ScreenShare['listSources']> {
    return this.screenShare.listSources();
  }

  async startScreenShare(request: StartScreenShare): Promise<ScreenShareOutcome> {
    if (!this.session) throw new Error('Join a voice channel before sharing your screen');
    const outcome = await this.screenShare.start(request);
    this.sendState();
    return outcome;
  }

  async stopScreenShare(): Promise<void> {
    await this.screenShare.stop();
    this.sendState();
  }

  setScreenPreset(preset: StartScreenShare['preset']): Promise<void> {
    return this.screenShare.setPreset(preset);
  }

  // ---- devices and telemetry --------------------------------------------

  async refreshDevices(): Promise<void> {
    const prefs = this.prefs();
    this.deps.mixer.setMasterVolume(prefs.outputVolume);
    await this.deps.mixer.setOutputDevice(prefs.outputDeviceId).catch(() => undefined);
    if (!this.target) return;
    const track = await this.deps.mic.reconfigure();
    if (track) {
      this.micTrack = track;
      await this.session?.setMicTrack(track);
    }
    const camera = useVoiceStore.getState().localCamera;
    if (camera && this.session) {
      const current = camera.getVideoTracks()[0]?.getSettings().deviceId ?? null;
      if (prefs.cameraDeviceId && current !== prefs.cameraDeviceId) {
        for (const t of camera.getTracks()) t.stop();
        await this.setVideo(true);
      }
    }
  }

  private async reportTelemetry(): Promise<void> {
    const session = this.session;
    const target = this.target;
    if (!session || !target) return;
    const quality = await session.collectStats();
    if (!quality) return;
    useVoiceStore.getState().setCall({ quality });
    const telemetry: VoiceTelemetry = {
      channel_id: target.channelId,
      jitter_ms: quality.jitterMs,
      loss_pct: quality.lossPct,
      rtt_ms: quality.rttMs,
      bitrate_kbps: quality.bitrateKbps,
    };
    this.deps.gateway.send(GatewayOp.VOICE_TELEMETRY, telemetry);
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    void this.leave();
    this.deps.mixer.dispose();
  }
}
