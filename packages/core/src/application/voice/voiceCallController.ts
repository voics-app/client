/**
 * Orchestrates the audio part of a voice call, the same on every platform: gateway op 4 /
 * VOICE_SERVER_UPDATE handshake, the voice session, mic and playback, mute and deafen, sink wants
 * and telemetry. The dispatch router forwards VOICE_SERVER_UPDATE to `onVoiceServerUpdate`.
 *
 * Platforms that do more (the desktop adds camera, screen share and device changes) extend it and use
 * the protected hooks; the mobile app uses it as it is.
 */
import { GatewayOp, type VoiceServerUpdate, type VoiceStateUpdatePayload, type VoiceTelemetry } from '../../contracts/gateway';
import type { VoiceState } from '../../contracts/rest';
import { SpeakingFlag, type MediaSinkWants } from '../../contracts/voice';
import { screenSinkWants } from '../../domain/sinkWants';
import type { GatewayPort } from '../ports/gateway';
import type { MediaTrackLike } from '../ports/media';
import type { MicPort, MixerPort, VoiceSessionPort } from '../ports/voice';
import { usePrefsStore, type PrefsData } from '../stores/prefsStore';
import { useLocalPeopleStore } from '../stores/localPeopleStore';
import { useSessionStore } from '../stores/sessionStore';
import { useUiStore } from '../stores/uiStore';
import { useVoiceStore } from '../stores/voiceStore';

export interface SessionParams {
  endpoint: string;
  region: string;
  serverId: string;
  userId: string;
  sessionId: string;
  token: string;
}

export interface PrefsSource {
  get(): PrefsData;
  subscribe(listener: (state: PrefsData, previous: PrefsData) => void): () => void;
}

export interface VoiceCallDeps {
  gateway: Pick<GatewayPort, 'send'>;
  createSession(params: SessionParams): VoiceSessionPort;
  mic: MicPort;
  mixer: MixerPort;
  prefs?: PrefsSource;
  telemetryMs?: number;
  serverUpdateTimeoutMs?: number;
}

export interface JoinTarget {
  guildId: string | null;
  channelId: string;
}

export class VoiceCallController {
  protected session: VoiceSessionPort | null = null;
  protected target: JoinTarget | null = null;
  protected micTrack: MediaTrackLike | null = null;
  protected disposers: (() => void)[] = [];
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private sessionDisposers: (() => void)[] = [];
  private transmitting = false;
  private mutedBeforeDeafen = false;
  private joinToken = 0;
  /** Last MEDIA_SINK_WANTS body sent on the current session, to skip identical resends. */
  private sentWants: string | null = null;

  constructor(protected readonly deps: VoiceCallDeps) {
    this.deps.mic.onLevel((level, transmitting) => {
      const self = useSessionStore.getState().user?.id;
      if (self) useVoiceStore.getState().setSpeaking(self, transmitting ? Math.max(level, 0.05) : 0);
      if (transmitting !== this.transmitting) {
        this.transmitting = transmitting;
        this.pushSpeaking();
      }
    });
    this.disposers.push(
      useVoiceStore.subscribe((state, previous) => {
        if (state.watching !== previous.watching || state.screenSsrcs !== previous.screenSsrcs) this.syncSinkWants();
      }),
    );
  }

  protected prefs(): PrefsData {
    return this.deps.prefs?.get() ?? usePrefsStore.getState();
  }

  // ---- hooks for platforms that do more ----------------------------------

  /** Releases local media a platform added (camera, screen share) before the session closes. */
  protected async releaseLocalMedia(): Promise<void> {}

  /** Called once a new session has started connecting, to hand it the local media a platform added. */
  protected onSessionStarted(_session: VoiceSessionPort): void {}

  /** Speaking flags beyond the microphone (shared-screen audio). */
  protected extraSpeakingFlags(): number {
    return 0;
  }

  // ---- join / leave ------------------------------------------------------

  async join(target: JoinTarget): Promise<void> {
    if (this.target) await this.leave();
    const token = ++this.joinToken;
    const store = useVoiceStore.getState();
    this.target = target;
    store.setCall({ status: 'requesting', guildId: target.guildId, channelId: target.channelId, error: null, e2ee: false, quality: null, rttHistory: [] });
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
    await this.releaseLocalMedia();
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
    this.sentWants = null;
    useVoiceStore.getState().setCall({ region: update.region });
    this.sessionDisposers = [
      session.onStatus((status) => {
        if (status === 'connected') {
          useVoiceStore.getState().setCall({ status: 'connected', error: null });
          // A (re)connected socket starts without wants, so opt back into watched screens.
          this.sentWants = null;
          this.syncSinkWants();
        } else if (status === 'connecting') useVoiceStore.getState().setCall({ status: 'connecting' });
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
    this.onSessionStarted(session);
    this.telemetryTimer = setInterval(() => void this.reportTelemetry(), this.deps.telemetryMs ?? 5000);
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

  protected sendState(): void {
    if (this.target) this.deps.gateway.send(GatewayOp.VOICE_STATE_UPDATE, this.statePayload(this.target));
  }

  requestToSpeak(requested: boolean): void {
    if (!this.target?.guildId) return;
    this.deps.gateway.send(GatewayOp.VOICE_STATE_UPDATE, {
      ...this.statePayload(this.target),
      request_to_speak_timestamp: requested ? new Date().toISOString() : null,
    });
  }

  protected pushSpeaking(): void {
    const flags = (this.transmitting ? SpeakingFlag.MICROPHONE : 0) | this.extraSpeakingFlags();
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

  /**
   * The SFU forwards a screen share only to subscribers that list its SSRC with quality > 0, so every change to what is
   * watched (or to the shares that exist) resends the whole map. Older SFUs ignore screen wants, which makes this harmless.
   */
  private syncSinkWants(): void {
    if (!this.session) return;
    const { screenSsrcs, watching } = useVoiceStore.getState();
    const wants = screenSinkWants(screenSsrcs, watching);
    const body = JSON.stringify(wants);
    if (body === this.sentWants || (this.sentWants === null && Object.keys(wants).length === 0)) return;
    this.sentWants = body;
    this.session.setSinkWants(wants);
  }

  // ---- telemetry ---------------------------------------------------------

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
