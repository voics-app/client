/**
 * The phone's voice call: the platform-free call handling of @discordy/core plus the camera.
 *
 * Safety. The camera track reaches the peer connection only through `VoiceSession.setCameraTrack`, which in an end-to-end encrypted call
 * pauses the camera sender, sets the track, attaches and enables the frame cryptor, and only then resumes it. Nothing here adds a track to the
 * connection by itself. Switching cameras replaces the capture through that same protected sender; it never replaces the sender or its cryptor.
 * A camera that was on is put back through `setCameraTrack` every time the connection comes up (a reconnect builds new senders).
 */
import { presetConstraints } from '@discordy/core/domain/videoPresets';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import type { VoiceSessionPort } from '@discordy/core/application/ports/voice';
import { VoiceCallController, type VoiceCallDeps } from '@discordy/core/application/voice/voiceCallController';
import type { JoinTarget } from '@discordy/core/application/voice/voiceCallController';
import type { VoiceServerUpdate } from '@discordy/core/contracts/gateway';
import { Permission } from '@discordy/core/contracts/permissions';
import { computeChannelPermissions, hasPermission } from '@discordy/core/domain/permissions';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { CameraFacing, NativeVideoStream } from './nativeVoice';
import { MobileScreenShare, type ScreenShareDriver } from './mobileScreenShare';

export interface MobileCallDeps extends VoiceCallDeps {
  screenShare?: ScreenShareDriver;
  openCamera(facing: CameraFacing): Promise<NativeVideoStream>;
  /** Calls the listener when the app goes to the background (not for a permission prompt or Control Center, which only make it inactive). A phone stops capturing then, so the camera is turned off rather than left sending a frozen picture. */
  onBackground(listener: () => void): () => void;
}

const CAMERA_PRESET = presetConstraints('720p30');

export class MobileCallController extends VoiceCallController {
  readonly screenShare: MobileScreenShare;
  private cameraFacing: CameraFacing = 'front';
  private readonly facingListeners = new Set<() => void>();
  private sessionWatch: (() => void) | null = null;
  /** Camera changes run one after the other: a quick double tap must not open two cameras. */
  private videoQueue: Promise<void> = Promise.resolve();
  /** The open camera capture. A failed call resets the store without stopping it, so the controller keeps its own hold to make sure the camera light goes out. */
  private held: NativeVideoStream | null = null;
  private captureGeneration = 0;

  constructor(private readonly mobile: MobileCallDeps) {
    super(mobile);
    this.screenShare = new MobileScreenShare({ driver: mobile.screenShare, session: () => this.session, announce: () => this.sendState(), canPublish: () => this.canStream() });
    this.disposers.push(
      mobile.onBackground(() => { this.setPushToTalk(false); void this.setVideo(false).catch(() => undefined); }),
      useGuildStore.subscribe(() => this.syncVoicePermissions(this.target)),
      useVoiceStore.subscribe((state, previous) => {
        if (state.states !== previous.states) this.syncVoicePermissions(this.target);
        if (state.call.status !== previous.call.status && (state.call.status === 'idle' || state.call.status === 'failed')) {
          this.releaseCapture();
          void this.screenShare.stop();
        }
      }),
    );
  }

  override async join(target: JoinTarget): Promise<void> {
    if (this.target) await this.leave();
    this.syncVoicePermissions(target);
    await super.join(target);
    if (this.target) this.syncVoicePermissions(this.target);
  }

  override onVoiceServerUpdate(update: VoiceServerUpdate): void {
    const accepted = this.target && update.guild_id === this.target.guildId && (this.session || update.channel_id === this.target.channelId);
    if (accepted) {
      this.mobile.mic.setPushToTalk?.(false);
      this.mobile.mic.setForcePushToTalk?.(true);
    }
    super.onVoiceServerUpdate(update);
    if (accepted) this.syncVoicePermissions(this.target);
  }

  setPushToTalk(pressed: boolean): void {
    this.mobile.mic.setPushToTalk?.(pressed);
  }

  private syncVoicePermissions(target: JoinTarget | null): void {
    const state = useGuildStore.getState();
    const guild = target?.guildId ? state.guilds[target.guildId] : undefined;
    const channel = target ? state.channels[target.channelId] : undefined;
    const user = useSessionStore.getState().user?.id;
    const member = target?.guildId && user ? state.members[target.guildId]?.[user] ?? useVoiceStore.getState().states[target.guildId]?.[user]?.member : undefined;
    const permissions = target?.guildId && guild && channel && user && (member || guild.owner_id === user)
      ? computeChannelPermissions({ guildId: target.guildId, ownerId: guild.owner_id, userId: user, memberRoleIds: member?.roles ?? [], roles: guild.roles }, channel.permission_overwrites ?? [])
      : 0n;
    const forced = Boolean(target?.guildId) && !hasPermission(permissions, Permission.USE_VAD);
    this.mobile.mic.setForcePushToTalk?.(forced);
    if (useVoiceStore.getState().requiresPtt !== forced) useVoiceStore.getState().setSelf({ requiresPtt: forced });
    if (this.target && !this.canStream()) {
      if (useVoiceStore.getState().selfVideo) void this.setVideo(false).catch(() => undefined);
      if (this.screenShare.status !== 'idle') void this.screenShare.stop().catch(() => undefined);
    }
  }

  get facing(): CameraFacing {
    return this.cameraFacing;
  }

  subscribeFacing = (listener: () => void): (() => void) => {
    this.facingListeners.add(listener);
    return () => void this.facingListeners.delete(listener);
  };

  protected override async releaseLocalMedia(): Promise<void> {
    this.captureGeneration += 1;
    this.sessionWatch?.();
    this.sessionWatch = null;
    // A permission sheet must not keep Leave waiting. A late capture result stops itself.
    await this.stopCamera();
    if (this.screenShare.status !== 'idle') await this.screenShare.stop();
  }

  protected override onSessionStarted(session: VoiceSessionPort): void {
    this.sessionWatch?.();
    this.sessionWatch = session.onStatus((status) => {
      if (status === 'connected') void this.runVideo(() => this.restoreCamera(session)).catch(() => this.setVideo(false));
      if (status === 'connected') void this.screenShare.restore(session);
    });
  }

  /** Turns the camera on or off; resolves once the camera is sending (or has stopped). Rejects with the reason when it cannot start, for example CAMERA_DENIED. */
  setVideo(enabled: boolean): Promise<void> {
    if (!enabled) this.captureGeneration += 1;
    const generation = this.captureGeneration;
    return this.runVideo(async () => {
      if (!enabled) {
        await this.stopCamera();
        this.sendState();
        return;
      }
      if (this.held) return;
      await this.startCamera(this.cameraFacing, generation);
    });
  }

  toggleVideo(): Promise<void> {
    return this.setVideo(!useVoiceStore.getState().selfVideo);
  }

  /** Switches between the front and the back camera while sending. */
  switchCamera(): Promise<void> {
    return this.runVideo(async () => {
      if (!this.held) return;
      const facing = this.cameraFacing === 'front' ? 'back' : 'front';
      const generation = this.captureGeneration;
      // The native deprecated _switchCamera discards applyConstraints' promise,
      // and Android retains its initial facing constraint. Reopen explicitly and
      // release the old camera first on devices that cannot open both at once.
      await this.stopCamera();
      this.sendState();
      // stopCamera releases one capture; another increment means Leave/background
      // cancelled this operation while detaching the previous sender track.
      if (this.captureGeneration !== generation + 1) return;
      await this.startCamera(facing, this.captureGeneration);
      if (this.held && this.cameraFacing !== facing) throw new Error(`The ${facing} camera is not available on this device.`);
    });
  }

  private async startCamera(facing: CameraFacing, generation: number): Promise<void> {
    if (generation !== this.captureGeneration) return;
    const session = this.session;
    if (!session || useVoiceStore.getState().call.status !== 'connected') throw new Error('The camera needs a connected call.');
    if (!this.canStream()) throw new Error('You do not have permission to use video in this channel.');
    const stream = await this.mobile.openCamera(facing);
    if (!this.canStream()) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('You do not have permission to use video in this channel.');
    }
    if (generation !== this.captureGeneration || this.session !== session || useVoiceStore.getState().call.status !== 'connected') {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('The camera produced no video');
    }
    try {
      await session.setCameraTrack(track, CAMERA_PRESET);
      if (generation !== this.captureGeneration || this.session !== session || !this.canStream()) {
        stream.getTracks().forEach((t) => t.stop());
        await session.setCameraTrack(null);
        return;
      }
    } catch (error) {
      stream.getTracks().forEach((t) => t.stop());
      throw error;
    }
    this.held = stream;
    const capturedFacing = track.getSettings?.().facingMode;
    this.cameraFacing = capturedFacing === 'user' ? 'front' : capturedFacing === 'environment' ? 'back' : facing;
    for (const listener of this.facingListeners) listener();
    track.onended = () => { void this.setVideo(false).catch(() => undefined); };
    useVoiceStore.getState().setLocalMedia({ localCamera: stream });
    useVoiceStore.getState().setSelf({ selfVideo: true });
    this.sendState();
  }

  private runVideo(task: () => Promise<void>): Promise<void> {
    const run = this.videoQueue.then(task);
    this.videoQueue = run.catch(() => undefined);
    return run;
  }

  private async restoreCamera(session: VoiceSessionPort): Promise<void> {
    const track = this.held?.getVideoTracks()[0];
    if (track && this.session === session) await session.setCameraTrack(track, CAMERA_PRESET);
  }

  private async stopCamera(): Promise<void> {
    if (!this.held && !useVoiceStore.getState().selfVideo) return;
    // The sender lets go of the track first, then the capture stops.
    await this.session?.setCameraTrack(null).catch(() => undefined);
    this.releaseCapture();
    useVoiceStore.getState().setLocalMedia({ localCamera: null });
    useVoiceStore.getState().setSelf({ selfVideo: false });
  }

  private releaseCapture(): void {
    this.captureGeneration += 1;
    this.held?.getVideoTracks().forEach((track) => { track.onended = null; });
    this.held?.getTracks().forEach((track) => track.stop());
    this.held = null;
    this.cameraFacing = 'front';
    for (const listener of this.facingListeners) listener();
  }
}
