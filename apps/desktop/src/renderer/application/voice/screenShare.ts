/**
 * Screen share orchestration: our picker (desktopCapturer sources) -> main-process
 * selection -> getDisplayMedia with preset constraints -> hand the track to the
 * voice session. DRM content captures as black; we detect that and report
 * `protected_content` so the UI can suggest Watch Together. We never bypass DRM.
 */
import type { CaptureSelection, CaptureSource } from '@shared/ipc';
import { presetConstraints, type ScreenPresetId } from '@renderer/domain/screenPresets';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { detectProtectedContent, type FrameSampler } from './blackFrame';
import type { ScreenTrackOptions } from './ports';

export interface ScreenShareHost {
  attach(track: MediaStreamTrack, options: ScreenTrackOptions, audio: MediaStream | null): Promise<void>;
  applyParameters(constraints: ScreenTrackOptions['constraints']): Promise<void>;
  detach(): Promise<void>;
}

export interface ScreenShareDeps {
  capture: { listSources(): Promise<CaptureSource[]>; select(selection: CaptureSelection): Promise<void> };
  getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStream>;
  platform: string;
  host: ScreenShareHost;
  createSampler(stream: MediaStream): FrameSampler;
  detectionMs?: number;
  wait?: (ms: number) => Promise<void>;
}

export type ScreenShareOutcome = { status: 'sharing' } | { status: 'protected_content' };

export interface StartScreenShare {
  sourceId: string;
  /** Capture system audio (Windows WASAPI loopback). Ignored elsewhere. */
  audio: boolean;
  preset: ScreenPresetId;
}

const hintFor = (preset: ScreenPresetId): 'detail' | 'motion' => (preset === '720p30' || preset === '1080p60' ? 'motion' : 'detail');

export class ScreenShare {
  private stream: MediaStream | null = null;
  private preset: ScreenPresetId = '1080p60';
  private readonly endedListeners = new Set<() => void>();

  constructor(private readonly deps: ScreenShareDeps) {}

  get active(): boolean {
    return this.stream !== null;
  }

  listSources(): Promise<CaptureSource[]> {
    return this.deps.capture.listSources();
  }

  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  private videoConstraints(preset: ScreenPresetId): MediaTrackConstraints {
    const c = presetConstraints(preset);
    if (c.width === undefined) return {};
    return {
      width: { ideal: c.width, max: c.width },
      height: { ideal: c.height, max: c.height },
      frameRate: { ideal: c.frameRate, max: c.frameRate },
    };
  }

  async start(request: StartScreenShare): Promise<ScreenShareOutcome> {
    if (this.stream) await this.stop();
    const wantAudio = request.audio && this.deps.platform === 'win32';
    await this.deps.capture.select({ sourceId: request.sourceId, audio: wantAudio });
    const stream = await this.deps.getDisplayMedia({ video: this.videoConstraints(request.preset), audio: wantAudio });
    const video = stream.getVideoTracks()[0];
    if (!video) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error('capture produced no video track');
    }

    const protectedContent = await this.probe(stream);
    if (protectedContent) {
      for (const track of stream.getTracks()) track.stop();
      return { status: 'protected_content' };
    }

    this.stream = stream;
    this.preset = request.preset;
    video.contentHint = hintFor(request.preset);
    video.addEventListener('ended', () => void this.stop().then(() => this.endedListeners.forEach((l) => l())));
    const audioTracks = stream.getAudioTracks();
    await this.deps.host.attach(
      video,
      { constraints: presetConstraints(request.preset), contentHint: hintFor(request.preset) },
      audioTracks.length > 0 ? new MediaStream(audioTracks) : null,
    );
    useVoiceStore.getState().setLocalMedia({ localScreen: stream });
    useVoiceStore.getState().setSelf({ selfStream: true, streamPreset: request.preset });
    return { status: 'sharing' };
  }

  private async probe(stream: MediaStream): Promise<boolean> {
    const sampler = this.deps.createSampler(stream);
    try {
      return await detectProtectedContent(sampler, { durationMs: this.deps.detectionMs ?? 1500, wait: this.deps.wait });
    } finally {
      sampler.dispose();
    }
  }

  async setPreset(preset: ScreenPresetId): Promise<void> {
    this.preset = preset;
    useVoiceStore.getState().setSelf({ streamPreset: preset });
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    const constraints = presetConstraints(preset);
    await track.applyConstraints(this.videoConstraints(preset)).catch(() => undefined);
    track.contentHint = hintFor(preset);
    await this.deps.host.applyParameters(constraints);
  }

  get currentPreset(): ScreenPresetId {
    return this.preset;
  }

  async stop(): Promise<void> {
    const stream = this.stream;
    if (!stream) return;
    this.stream = null;
    for (const track of stream.getTracks()) track.stop();
    await this.deps.host.detach();
    useVoiceStore.getState().setLocalMedia({ localScreen: null });
    useVoiceStore.getState().setSelf({ selfStream: false });
  }
}
