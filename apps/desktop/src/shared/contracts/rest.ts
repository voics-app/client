/**
 * REST object shapes (P9). Field names follow Discord API v10 exactly, plus the
 * Discordy extensions. This module stands in for `@discordy-voics/contracts`
 * until the generated package is published; swap the import path then.
 */

export type Snowflake = string;
export type DeliveryMode = 'standard' | 'ephemeral' | 'p2p';
export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';

export const ChannelType = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_STAGE_VOICE: 13,
  GUILD_FORUM: 15,
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export interface User {
  id: Snowflake;
  username: string;
  global_name: string | null;
  discriminator?: string;
  avatar: string | null;
  banner?: string | null;
  accent_color?: number | null;
  bio?: string;
  bot?: boolean;
  email?: string;
  mfa_enabled?: boolean;
}

export interface CustomStatus {
  text: string | null;
  emoji_name?: string | null;
  expires_at?: string | null;
}

export interface UserSettings {
  default_delivery_mode: DeliveryMode;
  status?: PresenceStatus;
  custom_status?: CustomStatus | null;
  theme?: 'dark' | 'light' | 'oled';
  locale?: string;
  developer_mode?: boolean;
  friend_source_flags?: { all?: boolean; mutual_friends?: boolean; mutual_guilds?: boolean };
  guild_positions?: Snowflake[];
  delivery_overrides?: Record<Snowflake, DeliveryMode>;
}

export interface Role {
  id: Snowflake;
  name: string;
  color: number;
  hoist: boolean;
  icon?: string | null;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
}

export interface PermissionOverwrite {
  id: Snowflake;
  /** 0 = role, 1 = member */
  type: 0 | 1;
  allow: string;
  deny: string;
}

export interface ThreadMetadata {
  archived: boolean;
  auto_archive_duration: number;
  archive_timestamp: string;
  locked: boolean;
}

export interface ForumTag {
  id: Snowflake;
  name: string;
  emoji_name?: string | null;
}

export interface Channel {
  id: Snowflake;
  type: ChannelType;
  guild_id?: Snowflake | null;
  position?: number;
  permission_overwrites?: PermissionOverwrite[];
  name?: string | null;
  topic?: string | null;
  nsfw?: boolean;
  last_message_id?: Snowflake | null;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  recipients?: User[];
  icon?: string | null;
  owner_id?: Snowflake;
  parent_id?: Snowflake | null;
  last_pin_timestamp?: string | null;
  rtc_region?: string | null;
  message_count?: number;
  member_count?: number;
  thread_metadata?: ThreadMetadata;
  available_tags?: ForumTag[];
  applied_tags?: Snowflake[];
  delivery_mode: DeliveryMode;
  voice_region?: string | null;
}

export interface Emoji {
  id: Snowflake | null;
  name: string | null;
  roles?: Snowflake[];
  user?: User;
  require_colons?: boolean;
  managed?: boolean;
  animated?: boolean;
  available?: boolean;
}

export interface GuildMember {
  user: User;
  nick?: string | null;
  avatar?: string | null;
  roles: Snowflake[];
  joined_at: string;
  deaf: boolean;
  mute: boolean;
  pending?: boolean;
  communication_disabled_until?: string | null;
}

export interface Guild {
  id: Snowflake;
  name: string;
  icon: string | null;
  banner?: string | null;
  description?: string | null;
  owner_id: Snowflake;
  afk_channel_id?: Snowflake | null;
  afk_timeout?: number;
  verification_level?: number;
  default_message_notifications?: number;
  explicit_content_filter?: number;
  roles: Role[];
  emojis: Emoji[];
  features?: string[];
  system_channel_id?: Snowflake | null;
  rules_channel_id?: Snowflake | null;
  preferred_locale?: string;
  member_count?: number;
  voice_region?: string | null;
}

/** GuildFull as delivered by READY / GUILD_CREATE (P4 `/state`). */
export interface GuildFull extends Guild {
  channels: Channel[];
  threads?: Channel[];
  members: GuildMember[];
  voice_states?: VoiceState[];
  presences?: PresenceUpdate[];
}

export interface Attachment {
  id: Snowflake;
  filename: string;
  description?: string;
  content_type?: string;
  size: number;
  url: string;
  proxy_url?: string;
  height?: number | null;
  width?: number | null;
}

export interface EmbedMedia {
  url: string;
  width?: number;
  height?: number;
}

export interface Embed {
  title?: string;
  type?: 'rich' | 'image' | 'video' | 'gifv' | 'article' | 'link';
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string };
  image?: EmbedMedia;
  thumbnail?: EmbedMedia;
  video?: EmbedMedia;
  provider?: { name?: string; url?: string };
  author?: { name: string; url?: string; icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

export interface Reaction {
  count: number;
  me: boolean;
  emoji: Emoji;
}

export interface MessageReference {
  message_id?: Snowflake;
  channel_id?: Snowflake;
  guild_id?: Snowflake;
  fail_if_not_exists?: boolean;
}

export interface Message {
  id: Snowflake;
  channel_id: Snowflake;
  guild_id?: Snowflake | null;
  author: User;
  member?: Partial<GuildMember>;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  tts?: boolean;
  mention_everyone: boolean;
  mentions: User[];
  mention_roles: Snowflake[];
  attachments: Attachment[];
  embeds: Embed[];
  reactions?: Reaction[];
  nonce?: string | number | null;
  pinned: boolean;
  type: number;
  flags?: number;
  message_reference?: MessageReference;
  referenced_message?: Message | null;
  thread?: Channel;
  application_id?: Snowflake;
  components?: MessageComponent[];
  interaction_metadata?: InteractionMetadata;
}

export const MessageFlag = {
  EPHEMERAL: 1 << 6,
  LOADING: 1 << 7,
} as const;

export const CommandType = { CHAT_INPUT: 1, USER: 2, MESSAGE: 3 } as const;

export const CommandOptionType = {
  SUB_COMMAND: 1,
  SUB_COMMAND_GROUP: 2,
  STRING: 3,
  INTEGER: 4,
  BOOLEAN: 5,
  USER: 6,
  CHANNEL: 7,
  ROLE: 8,
  MENTIONABLE: 9,
  NUMBER: 10,
  ATTACHMENT: 11,
} as const;

export interface CommandOptionChoice {
  name: string;
  value: string | number;
}

export interface ApplicationCommandOption {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  choices?: CommandOptionChoice[];
  options?: ApplicationCommandOption[];
  channel_types?: number[];
  min_value?: number;
  max_value?: number;
  min_length?: number;
  max_length?: number;
  autocomplete?: boolean;
}

export interface ApplicationCommand {
  id: Snowflake;
  type?: number;
  application_id: Snowflake;
  guild_id?: Snowflake;
  name: string;
  description: string;
  options?: ApplicationCommandOption[];
  default_member_permissions?: string | null;
  version?: Snowflake;
}

/** Application as listed by `GET /applications` (the caller's own applications). */
export interface ApplicationSummary {
  id: Snowflake;
  name: string;
  icon?: string | null;
  bot?: User;
}

/** Application entry of `GET /guilds/{id}/application-command-index`: an installed bot and its avatar. */
export interface CommandIndexApplication {
  id: Snowflake;
  name: string;
  icon: string | null;
  bot_id: Snowflake | null;
}

/** Response of `GET /guilds/{id}/application-command-index`: the commands a member can invoke in a guild. */
export interface CommandIndex {
  applications: CommandIndexApplication[];
  application_commands: ApplicationCommand[];
}

export const InteractionType = { APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3, AUTOCOMPLETE: 4, MODAL_SUBMIT: 5 } as const;

export const ComponentType = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  USER_SELECT: 5,
  ROLE_SELECT: 6,
  MENTIONABLE_SELECT: 7,
  CHANNEL_SELECT: 8,
} as const;

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: Emoji;
  default?: boolean;
}

export interface MessageComponent {
  type: number;
  custom_id?: string;
  style?: number;
  label?: string;
  emoji?: Emoji;
  url?: string;
  disabled?: boolean;
  options?: SelectOption[];
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  min_length?: number;
  max_length?: number;
  required?: boolean;
  value?: string;
  channel_types?: number[];
  components?: MessageComponent[];
}

export interface InteractionMetadata {
  id: Snowflake;
  type: number;
  user: User;
  name?: string;
}

/** Body of `POST /interactions` (P9): a user invokes a command, component or modal. */
export interface CreateInteractionBody {
  type: number;
  application_id: Snowflake;
  channel_id: Snowflake;
  guild_id?: Snowflake;
  message_id?: Snowflake;
  data: Record<string, unknown>;
}

/** `INTERACTION_MODAL_CREATE` dispatch payload. */
export interface ModalCreate {
  interaction_id: Snowflake;
  channel_id: Snowflake;
  data: { custom_id: string; title: string; components: MessageComponent[] };
}

export interface Invite {
  code: string;
  guild?: Partial<Guild>;
  channel?: Partial<Channel> | null;
  inviter?: User;
  approximate_member_count?: number;
  approximate_presence_count?: number;
  expires_at?: string | null;
  uses?: number;
  max_uses?: number;
  max_age?: number;
  temporary?: boolean;
  created_at?: string;
}

export const RelationshipType = {
  FRIEND: 1,
  BLOCKED: 2,
  INCOMING: 3,
  OUTGOING: 4,
} as const;
export type RelationshipType = (typeof RelationshipType)[keyof typeof RelationshipType];

export interface Relationship {
  id: Snowflake;
  type: RelationshipType;
  user: User;
  nickname?: string | null;
}

export interface Ban {
  reason: string | null;
  user: User;
}

export interface AuditLogEntry {
  id: Snowflake;
  target_id: string | null;
  user_id: Snowflake | null;
  action_type: number;
  changes?: { key: string; old_value?: unknown; new_value?: unknown }[];
  reason?: string;
  options?: Record<string, string>;
}

export interface AuditLog {
  audit_log_entries: AuditLogEntry[];
  users: User[];
}

export interface VoiceState {
  guild_id?: Snowflake | null;
  channel_id: Snowflake | null;
  user_id: Snowflake;
  member?: GuildMember;
  session_id: string;
  deaf: boolean;
  mute: boolean;
  self_deaf: boolean;
  self_mute: boolean;
  self_stream?: boolean;
  self_video: boolean;
  suppress: boolean;
  request_to_speak_timestamp?: string | null;
}

export interface Activity {
  name: string;
  type: number;
  state?: string | null;
  url?: string | null;
  emoji?: { name: string; id?: Snowflake | null } | null;
}

export interface PresenceUpdate {
  user: Pick<User, 'id'> & Partial<User>;
  guild_id?: Snowflake;
  status: PresenceStatus;
  activities: Activity[];
  client_status?: { desktop?: string; mobile?: string; web?: string };
}

export interface Device {
  device_id: Snowflake;
  identity_key_b64: string;
}

export interface VoiceRegion {
  id: string;
  name: string;
  optimal: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface ApiErrorBody {
  code: number;
  message: string;
  errors?: Record<string, unknown>;
}

export const ApiErrorCode = {
  UNKNOWN_CHANNEL: 10003,
  UNKNOWN_GUILD: 10004,
  UNKNOWN_MESSAGE: 10008,
  UNKNOWN_USER: 10013,
  MISSING_ACCESS: 50001,
  MISSING_PERMISSIONS: 50013,
  INVALID_FORM_BODY: 50035,
  VERIFICATION_REQUIRED: 40002,
  DELIVERY_MODE_CONFLICT: 50160,
  RATE_LIMITED: 429,
} as const;

export interface CreateMessageBody {
  content: string;
  nonce: string;
  attachments?: { id: string; filename: string; uploaded_filename: string }[];
  message_reference?: MessageReference;
  embeds?: Embed[];
}

export interface AttachmentUploadSlot {
  id: string;
  upload_url: string;
  upload_filename: string;
}

/** Short-lived coturn REST credentials minted by the gateway (P2 TURN_URLS / TURN_STATIC_AUTH_SECRET). */
export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  /** Seconds the credential stays valid. */
  ttl: number;
}

export interface ReadyPayload {
  v: number;
  user: User;
  session_id: string;
  resume_gateway_url?: string;
  guilds: GuildFull[];
  private_channels: Channel[];
  relationships: Relationship[];
  user_settings: UserSettings;
  read_state?: { id: Snowflake; last_message_id: Snowflake | null; mention_count: number }[];
  presences?: PresenceUpdate[];
  turn?: TurnCredentials;
}
