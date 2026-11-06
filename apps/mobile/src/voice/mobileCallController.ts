/**
 * The phone's voice call: the platform-free call handling of @discordy/core plus the camera.
 *
 * Safety. The camera track reaches the peer connection only through `VoiceSession.setCameraTrack`, which in an end-to-end encrypted call
 * pauses the camera sender, sets the track, attaches and enables the frame cryptor, and only then resumes it. Nothing here adds a track to the
 * connection by itself, and switching between the front and back camera flips the capture of the same track, so the sender and its cryptor are
 * never replaced. A camera that was on is put back through `setCameraTrack` every time the connection comes up (a reconnect builds new senders).
 */
import { presetConstraints } from '@discordy/core/domain/videoPresets';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import type { VoiceSessionPort } from '@discordy/core/application/ports/voice';
import { VoiceCallController, type VoiceCallDeps } from '@discordy/core/application/voice/voiceCallController';
import type { CameraFacing, NativeVideoStream } from './nativeVoice';

export interface MobileCallDeps extends VoiceCallDeps {
  openCamera(facing: CameraFacing): Promise<NativeVideoStream>;
  /** Calls the listener when the app goes to the background (not for a permission prompt or Control Center, which only make it inactive). A phone stops capturing then, so the camera is turned off rather than left sending a frozen picture. */
  onBackground(listener: () => void): () => void;
}

const CAMERA_PRESET = presetConstraints('720p30');

export class MobileCallController extends VoiceCallController {
  private cameraFacing: CameraFacing = 'front';
  private readonly facingListeners = new Set<() => void>();
  private sessionWatch: (() => void) | null = null;
  /** Camera changes run one after the other: a quick double tap must not open two cameras. */
  private videoQueue: Promise<void> = Promise.resolve();
  /** The open camera capture. A failed call resets the store without stopping it, so the controller keeps its own hold to make sure the camera light goes out. */
  private held: NativeVideoStream | null = null;

  constructor(private readonly mobile: MobileCallDeps) {
    super(mobile);
    this.disposers.push(
      mobile.onBackground(() => void this.setVideo(false).catch(() => undefined)),
      useVoiceStore.subscribe((state, previous) => {
        if (state.call.status !== previous.call.status && (state.call.status === 'idle' || state.call.status === 'failed')) this.releaseCapture();
      }),
    );
  }

  get facing(): CameraFacing {
    return this.cameraFacing;
  }

  subscribeFacing = (listener: () => void): (() => void) => {
    this.facingListeners.add(listener);
    return () => void this.facingListeners.delete(listener);
  };

  protected override async releaseLocalMedia(): Promise<void> {
    this.sessionWatch?.();
    this.sessionWatch = null;
    await this.runVideo(() => this.stopCamera());
  }

  protected override onSessionStarted(session: VoiceSessionPort): void {
    this.sessionWatch?.();
    this.sessionWatch = session.onStatus((status) => {
      if (status === 'connected') void this.runVideo(() => this.restoreCamera(session)).catch(() => undefined);
    });
  }

  /** Turns the camera on or off; resolves once the camera is sending (or has stopped). Rejects with the reason when it cannot start, for example CAMERA_DENIED. */
  setVideo(enabled: boolean): Promise<void> {
    return this.runVideo(async () => {
      if (!enabled) {
        await this.stopCamera();
        this.sendState();
        return;
      }
      if (this.held) return;
      const stream = await this.mobile.openCamera(this.cameraFacing);
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('The camera produced no video');
      }
      try {
        await this.session?.setCameraTrack(track, CAMERA_PRESET);
      } catch (error) {
        stream.getTracks().forEach((t) => t.stop());
        throw error;
      }
      this.held = stream;
      useVoiceStore.getState().setLocalMedia({ localCamera: stream });
      useVoiceStore.getState().setSelf({ selfVideo: true });
      this.sendState();
    });
  }

  toggleVideo(): Promise<void> {
    return this.setVideo(!useVoiceStore.getState().selfVideo);
  }

  /** Switches between the front and the back camera while sending. */
  switchCamera(): void {
    const track = this.held?.getVideoTracks()[0];
    if (!track) return;
    track._switchCamera();
    this.cameraFacing = this.cameraFacing === 'front' ? 'back' : 'front';
    for (const listener of this.facingListeners) listener();
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
    this.held?.getTracks().forEach((track) => track.stop());
    this.held = null;
    this.cameraFacing = 'front';
    for (const listener of this.facingListeners) listener();
  }
}
