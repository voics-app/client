/**
 * The desktop voice call: the platform-free call handling of @discordy/core plus camera, screen
 * share and live device changes. The dispatch router forwards VOICE_SERVER_UPDATE to
 * `onVoiceServerUpdate`.
 */
import { SpeakingFlag } from '@discordy/core/contracts/voice';
import { Permission } from '@discordy/core/contracts/permissions';
import { computeChannelPermissions, hasPermission } from '@discordy/core/domain/permissions';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { VoiceServerUpdate } from '@discordy/core/contracts/gateway';
import { cameraCaptureConstraints, presetConstraints, type VideoPresetId } from '@discordy/core/domain/videoPresets';
import type { PrefsData } from '@discordy/core/application/stores/prefsStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { VoiceCallController, type SessionParams, type VoiceCallDeps, type JoinTarget } from '@discordy/core/application/voice/voiceCallController';
import type { MicPort, ScreenTrackOptions, VoiceSessionPort } from './ports';
import { ScreenShare, type ScreenShareDeps, type ScreenShareHost, type StartScreenShare, type ScreenShareOutcome } from './screenShare';

export type { JoinTarget, SessionParams };

export interface VoiceControllerDeps extends VoiceCallDeps {
  mic: MicPort;
  openCamera(deviceId: string | null, preset: VideoPresetId): Promise<MediaStream>;
  screen: Omit<ScreenShareDeps, 'host'>;
}

const DEVICE_KEYS = ['inputDeviceId', 'outputDeviceId', 'cameraDeviceId', 'noiseSuppression', 'echoCancellation', 'autoGain', 'inputMode', 'vadThreshold', 'pttKeycode', 'pttReleaseDelayMs', 'inputVolume', 'outputVolume'] as const;

/** The local camera and screen streams are browser streams on desktop (see platformMedia.d.ts). */
const videoTrackOf = (stream: MediaStream | null | undefined): MediaStreamTrack | undefined => stream?.getVideoTracks()[0];

export class VoiceController extends VoiceCallController {
  private soundshare = false;
  private readonly screenShare: ScreenShare;

  constructor(private readonly desktop: VoiceControllerDeps) {
    super(desktop);
    const host: ScreenShareHost = {
      attach: async (track, options, audio) => {
        await this.session?.setScreenTrack(track, options);
        this.desktop.mic.setSoundshare(audio);
        this.soundshare = audio !== null;
        this.pushSpeaking();
      },
      applyParameters: async (constraints) => {
        await this.session?.applyScreenParameters(constraints);
      },
      detach: async () => {
        await this.session?.setScreenTrack(null);
        this.desktop.mic.setSoundshare(null);
        this.soundshare = false;
        this.pushSpeaking();
      },
    };
    this.screenShare = new ScreenShare({ ...desktop.screen, host });
    this.screenShare.onEnded(() => this.sendState());

    const prefs = desktop.prefs ?? {
      get: () => usePrefsStore.getState(),
      subscribe: (l: (s: PrefsData, p: PrefsData) => void) => usePrefsStore.subscribe(l),
    };
    this.disposers.push(
      useGuildStore.subscribe(() => this.syncVoicePermissions(this.target)),
      prefs.subscribe((state, previous) => {
        if (DEVICE_KEYS.some((k) => state[k] !== previous[k])) void this.refreshDevices();
        if (state.cameraPreset !== previous.cameraPreset) void this.applyCameraPreset();
      }),
    );
  }

  override async join(target: JoinTarget): Promise<void> {
    if (this.target) await this.leave();
    this.syncVoicePermissions(target);
    await super.join(target);
  }

  override onVoiceServerUpdate(update: VoiceServerUpdate): void {
    const accepted = this.target && update.guild_id === this.target.guildId && (this.session || update.channel_id === this.target.channelId);
    if (accepted) this.desktop.mic.setForcePushToTalk?.(true);
    super.onVoiceServerUpdate(update);
    if (accepted) this.syncVoicePermissions(this.target);
  }

  private syncVoicePermissions(target: JoinTarget | null): void {
    if (!target?.guildId) {
      this.desktop.mic.setForcePushToTalk?.(false);
      return;
    }
    const state = useGuildStore.getState();
    const guild = state.guilds[target.guildId];
    const channel = state.channels[target.channelId];
    const user = useSessionStore.getState().user?.id;
    const member = user ? state.members[target.guildId]?.[user] : undefined;
    const permissions = guild && channel && user && member
      ? computeChannelPermissions({ guildId: target.guildId, ownerId: guild.owner_id, userId: user, memberRoleIds: member.roles, roles: guild.roles }, channel.permission_overwrites ?? [])
      : 0n;
    this.desktop.mic.setForcePushToTalk?.(!hasPermission(permissions, Permission.USE_VAD));
  }

  protected override async releaseLocalMedia(): Promise<void> {
    await this.screenShare.stop();
    await this.stopCamera();
  }

  protected override onSessionStarted(session: VoiceSessionPort): void {
    void this.restoreLocalMedia(session);
  }

  protected override extraSpeakingFlags(): number {
    return this.soundshare ? SpeakingFlag.SOUNDSHARE : 0;
  }

  private async restoreLocalMedia(session: VoiceSessionPort): Promise<void> {
    const camera = videoTrackOf(useVoiceStore.getState().localCamera);
    if (camera) await session.setCameraTrack(camera, presetConstraints(this.prefs().cameraPreset));
    const screen = videoTrackOf(useVoiceStore.getState().localScreen);
    if (screen) {
      const options: ScreenTrackOptions = { constraints: presetConstraints(this.screenShare.currentPreset), contentHint: 'motion' };
      await session.setScreenTrack(screen, options);
    }
  }

  // ---- camera ------------------------------------------------------------

  async setVideo(enabled: boolean): Promise<void> {
    if (!enabled) {
      await this.stopCamera();
      this.sendState();
      return;
    }
    const { cameraDeviceId, cameraPreset } = this.prefs();
    const stream = await this.desktop.openCamera(cameraDeviceId, cameraPreset);
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('camera produced no video track');
    await this.session?.setCameraTrack(track, presetConstraints(cameraPreset));
    useVoiceStore.getState().setLocalMedia({ localCamera: stream });
    useVoiceStore.getState().setSelf({ selfVideo: true });
    this.sendState();
  }

  /** Re-applies the camera quality preset to the live track and the sender. */
  private async applyCameraPreset(): Promise<void> {
    const track = videoTrackOf(useVoiceStore.getState().localCamera);
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

  // ---- devices -----------------------------------------------------------

  async refreshDevices(): Promise<void> {
    const prefs = this.prefs();
    this.desktop.mixer.setMasterVolume(prefs.outputVolume);
    await this.desktop.mixer.setOutputDevice(prefs.outputDeviceId).catch(() => undefined);
    if (!this.target) return;
    const track = await this.desktop.mic.reconfigure();
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
}
