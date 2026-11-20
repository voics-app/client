/** Voice WebSocket protocol (P8), frames `{op, d}`. */

export const VoiceOp = {
  IDENTIFY: 0,
  SELECT_PROTOCOL: 1,
  READY: 2,
  HEARTBEAT: 3,
  SESSION_DESCRIPTION: 4,
  SPEAKING: 5,
  HEARTBEAT_ACK: 6,
  HELLO: 8,
  CLIENTS_CONNECT: 11,
  VIDEO: 12,
  CLIENT_DISCONNECT: 13,
  MEDIA_SINK_WANTS: 15,
  STREAM_VIEWERS: 40,
  PUBLISH_PERMISSIONS: 41,
  DAVE_PREPARE_TRANSITION: 21,
  DAVE_EXECUTE_TRANSITION: 22,
  DAVE_MLS_EXTERNAL_SENDER: 25,
  DAVE_MLS_KEY_PACKAGE: 26,
  DAVE_MLS_PROPOSALS: 27,
  DAVE_MLS_COMMIT_WELCOME: 28,
  DAVE_MLS_ANNOUNCE_COMMIT: 29,
  DAVE_MLS_WELCOME: 30,
  DAVE_MLS_INVALID_COMMIT: 31,
} as const;
export type VoiceOp = (typeof VoiceOp)[keyof typeof VoiceOp];

export interface VoiceFrame<D = unknown> {
  op: number;
  d: D;
}

export interface VoiceIdentify {
  server_id: string;
  user_id: string;
  session_id: string;
  token: string;
  video: boolean;
}

export interface VoiceStreamDescriptor {
  type: 'video' | 'screen';
  rid: string;
  quality: number;
  ssrc: number;
  rtx_ssrc: number;
  active?: boolean;
  max_bitrate?: number;
  max_framerate?: number;
  max_resolution?: { width: number; height: number; type: 'fixed' | 'source' };
}

export interface VoiceReady {
  /** Present and true only for a node with the enforced soundboard transport. */
  soundboard_transport?: boolean;
  ssrc: number;
  ip: string;
  port: number;
  modes: string[];
  streams: VoiceStreamDescriptor[];
}

export type VideoCodecName = 'VP8' | 'VP9' | 'AV1' | 'H264';

export interface CodecDescriptor {
  name: 'opus' | VideoCodecName;
  type: 'audio' | 'video';
  priority: number;
  payload_type: number;
  rtx_payload_type?: number;
}

export interface SelectProtocol {
  protocol: 'webrtc';
  data: {
    ice_ufrag: string;
    ice_pwd: string;
    fingerprint: string;
    setup: 'actpass';
    /** SSRCs from the client's offer. Browsers pick their own, so the node uses these instead of READY's. */
    ssrcs?: { audio: number; soundboard?: number; video: number; rtx: number; screen?: number; screen_rtx?: number };
  };
  codecs: CodecDescriptor[];
}

export interface IceCandidateDescriptor {
  ip: string;
  port: number;
  protocol: 'udp';
}

/** Server-to-session announcement after the SFU has applied an ordered capability. */
export interface PublishPermissions {
  session_id: string;
  revision: number;
  expires_at: number;
  can_publish_audio: boolean;
  can_publish_video: boolean;
  can_publish_soundboard: boolean;
}

export interface SessionDescription {
  ice_ufrag: string;
  ice_pwd: string;
  fingerprint: string;
  candidates: IceCandidateDescriptor[];
  audio_codec: string;
  video_codec: string;
  e2ee: { protocol_version: number } | null;
}

export const SpeakingFlag = {
  MICROPHONE: 1,
  SOUNDSHARE: 2,
  PRIORITY: 4,
} as const;

export interface Speaking {
  speaking: number;
  ssrc: number;
  user_id?: string;
}

export interface VoiceHello {
  heartbeat_interval: number;
}

export interface ClientsConnect {
  user_ids: string[];
}

export interface VideoPayload {
  audio_ssrc: number;
  soundboard_ssrc?: number | null;
  video_ssrc: number;
  rtx_ssrc: number;
  streams: VoiceStreamDescriptor[];
  user_id?: string;
}

export interface ClientDisconnect {
  user_id: string;
}

/** Sent only to the streamer: everyone currently watching their screen share (the complete list, empty = nobody). */
export interface StreamViewers {
  ssrc: number;
  user_ids: string[];
}

/** `{"<ssrc>": quality 0-100}` */
export type MediaSinkWants = Record<string, number>;
