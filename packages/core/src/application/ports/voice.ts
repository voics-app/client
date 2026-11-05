/** Ports the voice application layer depends on. Implemented by each app's infrastructure. */
import type { MediaSinkWants } from '../../contracts/voice';
import type { CaptureConstraints } from '../../domain/videoPresets';
import type { CallQuality } from '../stores/voiceStore';
import type { MediaKind, MediaStreamLike, MediaTrackLike, RtpReceiverLike, RtpSenderLike } from './media';

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
  setMicTrack(track: MediaTrackLike | null): Promise<void>;
  setCameraTrack(track: MediaTrackLike | null, constraints?: CaptureConstraints): Promise<void>;
  setScreenTrack(track: MediaTrackLike | null, options?: ScreenTrackOptions): Promise<void>;
  applyScreenParameters(constraints: CaptureConstraints): Promise<void>;
  setSinkWants(wants: MediaSinkWants): void;
  collectStats(): Promise<CallQuality | null>;
  onStatus(listener: (status: SessionStatus) => void): () => void;
  onClosed(listener: (info: SessionClosed) => void): () => void;
  /** Emits true only once media keys are installed and frame transforms are attached. */
  onE2ee(listener: (active: boolean) => void): () => void;
  onRemoteAudio(listener: (userId: string, stream: MediaStreamLike | null) => void): () => void;
}

export interface MicPort {
  /** Starts capture and resolves the processed track that is sent to peers. */
  start(): Promise<MediaTrackLike>;
  stop(): void;
  setSelfMute(muted: boolean): void;
  onLevel(listener: (level: number, transmitting: boolean) => void): () => void;
}

export interface MixerPort {
  setStream(userId: string, stream: MediaStreamLike | null): void;
  setUserVolume(userId: string, volume: number): void;
  setMasterVolume(volume: number): void;
  setDeafened(deafened: boolean): void;
  setOutputDevice(deviceId: string | null): Promise<void>;
  dispose(): void;
}

/** Key material of one sender at one key index (see `frameKeyLabel`): 32 bytes from the MLS exporter of the epoch
 * that was just installed. Only valid while that epoch is the latest one. */
export type KeyMaterialSource = (userId: string, keyIndex: number) => Promise<Uint8Array>;

/** Protects media frames end to end (DAVE, frame format of domain/frameFormat). A platform without a transform API reports `supported: false`.
 * Frames that are not valid protected frames are dropped, never forwarded. */
export interface FrameCryptorPort {
  /** False when neither transform API exists; callers must then refuse E2EE rather than send clear media. */
  readonly supported: boolean;
  /** True when the cryptor passes frames in clear until it is created and enabled, and can only be created on a
   * sender that already holds a track (react-native-webrtc). The session then never lets a track reach a sender, or
   * a remote track play, before the cryptor is attached and confirmed. */
  readonly gated: boolean;
  /** Resolves only when the sender is protected: frames can no longer leave it in clear. Rejects otherwise. */
  attachSender(sender: RtpSenderLike, kind: MediaKind, codec: string, userId: string): Promise<void>;
  /** Resolves only when the receiver drops every frame that is not authentic. Rejects otherwise. */
  attachReceiver(receiver: RtpReceiverLike, kind: MediaKind, codec: string, userId: string): Promise<void>;
  /** Pipes clear media straight through on a sender or receiver of a call that is not E2EE. Only the
   * encoded-streams fallback needs it: with `encodedInsertableStreams` set, Chromium sends and plays
   * nothing until every endpoint's streams are consumed. A no-op with RTCRtpScriptTransform. */
  bypass(endpoint: RtpSenderLike | RtpReceiverLike): void;
  /** Installs the keys of an epoch (for every known sender) without sending with them. */
  setEpoch(generation: number, material: KeyMaterialSource): Promise<void>;
  /** Starts sending with the keys of this epoch. */
  activate(generation: number): Promise<void>;
  /** Stops sending and forgets keys. */
  clear(): void;
  dispose(): void;
}

/** The MLS-based media key exchange of an end-to-end encrypted call. */
export interface MediaGroupSession {
  start(protocolVersion: number): Promise<void>;
  stop(): void;
  handleOp(op: number, d: unknown): Promise<void>;
  participantLeft(userId: string): Promise<void>;
}

export interface MediaGroupHooks {
  onActive(active: boolean): void;
  onError(message: string): void;
  hasPeers(): boolean;
}
