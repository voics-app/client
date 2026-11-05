/**
 * What the voice session needs from a WebRTC stack and from live media, as structural types.
 * The browser (Electron) and react-native-webrtc both implement these shapes, so the core never
 * names `RTCPeerConnection` or `MediaStream`: each app builds its peer connection and hands it over
 * through `createPeerConnection`.
 */

export type MediaKind = 'audio' | 'video';

export interface MediaTrackLike {
  readonly kind: string;
  contentHint?: string;
  stop(): void;
}

export interface MediaStreamLike {
  getTracks(): MediaTrackLike[];
  getVideoTracks(): MediaTrackLike[];
}

export interface RtpEncodingLike {
  maxBitrate?: number;
  maxFramerate?: number;
}

export interface RtpParametersLike {
  encodings?: RtpEncodingLike[];
}

/** One entry of a stats report; the fields read are the standard WebRTC stats names. */
export type StatsEntry = Record<string, unknown>;

export interface StatsReportLike {
  values(): Iterable<StatsEntry>;
}

export interface RtpSenderLike {
  readonly track: MediaTrackLike | null;
  replaceTrack(track: MediaTrackLike | null): Promise<void>;
  getParameters(): RtpParametersLike;
  setParameters(parameters: RtpParametersLike): Promise<unknown>;
  getStats(): Promise<StatsReportLike>;
}

/** Opaque: only the frame cryptor of a platform looks inside. */
export type RtpReceiverLike = object;

export interface TransceiverLike {
  readonly mid: string | null;
  readonly sender: RtpSenderLike;
  readonly receiver: RtpReceiverLike;
}

export interface TrackEventLike {
  readonly track: MediaTrackLike;
  readonly receiver: RtpReceiverLike;
  readonly transceiver: TransceiverLike;
  readonly streams: readonly MediaStreamLike[];
}

export interface MediaPeerConnection {
  readonly connectionState: string;
  ontrack: ((event: TrackEventLike) => void) | null;
  onconnectionstatechange: (() => void) | null;
  addTransceiver(kindOrTrack: MediaKind | MediaTrackLike, init?: { direction?: 'sendrecv' | 'recvonly' | 'sendonly' | 'inactive' }): TransceiverLike;
  createOffer(): Promise<{ sdp?: string }>;
  setLocalDescription(description: { type: 'offer'; sdp: string }): Promise<void>;
  setRemoteDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
  getStats(): Promise<StatsReportLike>;
  close(): void;
}
