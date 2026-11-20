/** Gateway protocol (P7): client <-> gateway, `wss://<gateway>/gateway?v=1&encoding=json`. */
import type { DeliveryMode, PresenceStatus, Activity, ReadStateEntry, Snowflake, VoiceState } from './rest';

export const GatewayOp = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  REQUEST_GUILD_MEMBERS: 8,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
  E2EE_ENVELOPE: 20,
  E2EE_ACK: 21,
  P2P_SIGNAL: 22,
  VOICE_TELEMETRY: 23,
  WATCH_TOGETHER: 24,
  CALL_DECLINE: 25,
  CALL_RING: 26,
} as const;
export type GatewayOp = (typeof GatewayOp)[keyof typeof GatewayOp];

export interface GatewayFrame<D = unknown> {
  op: number;
  d: D;
  s: number | null;
  t: string | null;
}

export const GatewayCloseCode = {
  UNKNOWN: 4000,
  UNKNOWN_OPCODE: 4001,
  DECODE_ERROR: 4002,
  NOT_AUTHENTICATED: 4003,
  AUTHENTICATION_FAILED: 4004,
  ALREADY_AUTHENTICATED: 4005,
  INVALID_SEQ: 4007,
  RATE_LIMITED: 4008,
  SESSION_TIMED_OUT: 4009,
  INVALID_INTENTS: 4013,
  DISALLOWED_INTENTS: 4014,
} as const;

/** Close codes after which reconnecting cannot succeed without user action. */
export const FATAL_CLOSE_CODES: ReadonlySet<number> = new Set([
  GatewayCloseCode.AUTHENTICATION_FAILED,
  GatewayCloseCode.INVALID_INTENTS,
  GatewayCloseCode.DISALLOWED_INTENTS,
]);

/** Close codes after which the session cannot be resumed (a fresh IDENTIFY is required). */
export const NON_RESUMABLE_CLOSE_CODES: ReadonlySet<number> = new Set([
  GatewayCloseCode.INVALID_SEQ,
  GatewayCloseCode.SESSION_TIMED_OUT,
]);

export const Intent = {
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_MODERATION: 1 << 2,
  GUILD_EMOJIS: 1 << 3,
  GUILD_INTEGRATIONS: 1 << 4,
  GUILD_WEBHOOKS: 1 << 5,
  GUILD_INVITES: 1 << 6,
  GUILD_VOICE_STATES: 1 << 7,
  GUILD_PRESENCES: 1 << 8,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  GUILD_MESSAGE_TYPING: 1 << 11,
  DIRECT_MESSAGES: 1 << 12,
  DIRECT_MESSAGE_REACTIONS: 1 << 13,
  DIRECT_MESSAGE_TYPING: 1 << 14,
  MESSAGE_CONTENT: 1 << 15,
} as const;

export const ALL_INTENTS: number = Object.values(Intent).reduce((acc, bit) => acc | bit, 0);

export interface HelloPayload {
  heartbeat_interval: number;
}

export interface IdentifyPayload {
  token: string;
  device_id: Snowflake;
  intents: number;
  properties: { os: string; client: string; version: string };
  presence?: PresenceUpdatePayload;
}

export interface ResumePayload {
  token: string;
  session_id: string;
  seq: number;
}

export interface PresenceUpdatePayload {
  status: Exclude<PresenceStatus, 'offline'>;
  activities: Activity[];
  afk: boolean;
  /** P7 optional lifecycle hint; only mobile user sessions receive a bounded background lease. */
  background?: boolean;
}

export interface VoiceStateUpdatePayload {
  guild_id: Snowflake | null;
  channel_id: Snowflake | null;
  self_mute: boolean;
  self_deaf: boolean;
  self_video: boolean;
  self_stream: boolean;
  request_to_speak_timestamp?: string | null;
}

export interface RequestGuildMembersPayload {
  guild_id: Snowflake;
  query?: string;
  limit: number;
  user_ids?: Snowflake[];
  nonce: string;
}

export type E2EEContentType = 'application' | 'commit' | 'welcome' | 'proposal';

export interface E2EERecipient {
  user_id: Snowflake;
  device_id: Snowflake;
  ciphertext_b64: string;
}

export interface E2EEEnvelope {
  channel_id: Snowflake;
  message_id: Snowflake;
  sender_device_id: Snowflake;
  recipients: E2EERecipient[];
  mls_epoch: number;
  content_type: E2EEContentType;
}

export interface E2EEAck {
  message_ids: Snowflake[];
}

export type P2PSignalKind = 'offer' | 'answer' | 'ice' | 'bye';

export interface P2PSignal {
  channel_id: Snowflake;
  to_user_id: Snowflake;
  to_device_id: Snowflake;
  from_user_id: Snowflake;
  from_device_id: Snowflake;
  kind: P2PSignalKind;
  payload: string;
  identity_sig_b64: string;
}

export interface VoiceTelemetry {
  channel_id: Snowflake;
  jitter_ms: number;
  loss_pct: number;
  rtt_ms: number;
  bitrate_kbps: number;
}

export type WatchTogetherAction = 'load' | 'play' | 'pause' | 'seek';

export interface WatchTogetherPayload {
  channel_id: Snowflake;
  action: WatchTogetherAction;
  url?: string;
  position_ms: number;
  at_server_ms: number;
  user_id?: Snowflake;
}

export interface VoiceServerUpdate {
  token: string;
  guild_id: Snowflake | null;
  channel_id: Snowflake;
  endpoint: string;
  region: string;
}

export interface TypingStart {
  channel_id: Snowflake;
  guild_id?: Snowflake;
  user_id: Snowflake;
  timestamp: number;
}

export interface MessageAck {
  channel_id: Snowflake;
  message_id: Snowflake;
  mention_count?: number;
  read_state_version?: string;
}

export interface ReadStateUpdate {
  channel_id: Snowflake;
  last_message_id: Snowflake | null;
  mention_count: number;
  read_state_version: string;
}

export interface ReadStateSync {
  read_state_versioned: true;
  read_state: ReadStateEntry[];
}

export interface P2PSignalFailed {
  channel_id: Snowflake;
  to_user_id: Snowflake;
  to_device_id?: Snowflake;
  error: 'peer_offline' | string;
}

export interface ChannelDeliveryModeUpdate {
  channel_id: Snowflake;
  delivery_mode: DeliveryMode;
}

/** A DM or group DM call (CALL_CREATE / CALL_UPDATE). `ringing` lists the recipients not yet in it. */
export interface CallEvent {
  channel_id: Snowflake;
  message_id: null;
  region: string;
  ringing: Snowflake[];
  voice_states: VoiceState[];
}

export interface CallDeleteEvent {
  channel_id: Snowflake;
  message_id: null;
}

export interface CallDeclinePayload {
  channel_id: Snowflake;
}

/** Rings recipients of a DM or group DM into a running call (1 to 10 users who are not in it). */
export interface CallRingPayload {
  channel_id: Snowflake;
  user_ids: Snowflake[];
}
