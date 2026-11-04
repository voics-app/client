/** Ports the voice application layer depends on. Implemented in infrastructure/voice and infrastructure/audio. */
import type { MediaSinkWants } from '@discordy/core/contracts/voice';
import type { CaptureConstraints } from '@discordy/core/domain/videoPresets';
import type { CallQuality } from '@discordy/core/application/stores/voiceStore';

export type SessionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface SessionClosed {
  /** True when reconnecting cannot help (auth failure, e2ee unsupported, ...). */
  fatal: boolean;
  reason: string;
}

export interface ScreenTrackOptions {
  constraints: CaptureConstraints;
  contentHint: 'detail' | 'motion';
}

export interface VoiceSessionPort {
  readonly region: string | null;
  connect(): void;
  close(): void;
  setSpeaking(flags: number): void;
  setMicTrack(track: MediaStreamTrack | null): Promise<void>;
  setCameraTrack(track: MediaStreamTrack | null, constraints?: CaptureConstraints): Promise<void>;
  setScreenTrack(track: MediaStreamTrack | null, options?: ScreenTrackOptions): Promise<void>;
  applyScreenParameters(constraints: CaptureConstraints): Promise<void>;
  setSinkWants(wants: MediaSinkWants): void;
  collectStats(): Promise<CallQuality | null>;
  onStatus(listener: (status: SessionStatus) => void): () => void;
  onClosed(listener: (info: SessionClosed) => void): () => void;
  /** Emits true only once media keys are installed and frame transforms are attached. */
  onE2ee(listener: (active: boolean) => void): () => void;
  onRemoteAudio(listener: (userId: string, stream: MediaStream | null) => void): () => void;
}

export interface MicPort {
  /** Starts capture and resolves the processed track that is sent to peers. */
  start(): Promise<MediaStreamTrack>;
  stop(): void;
  setSelfMute(muted: boolean): void;
  /** Mixes shared-screen audio into the outgoing track (ungated); null removes it. */
  setSoundshare(stream: MediaStream | null): void;
  /** Re-reads prefs (devices, constraints, VAD/PTT); resolves a new track when capture had to restart, else null. */
  reconfigure(): Promise<MediaStreamTrack | null>;
  onLevel(listener: (level: number, transmitting: boolean) => void): () => void;
}

export interface MixerPort {
  setStream(userId: string, stream: MediaStream | null): void;
  setUserVolume(userId: string, volume: number): void;
  setMasterVolume(volume: number): void;
  setDeafened(deafened: boolean): void;
  setOutputDevice(deviceId: string | null): Promise<void>;
  dispose(): void;
}
