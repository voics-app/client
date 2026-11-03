/**
 * REST object shapes (P9). Field names follow Discord API v10 exactly, plus the
 * platform extensions. This module stands in for `@discordy-voics/contracts`
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
  verified?: boolean;
}

export interface CustomStatus {
  text: string | null;
  emoji_id?: Snowflake | null;
  emoji_name?: string | null;
  expires_at?: string | null;
}

/** One server-rail entry (user settings `guild_folders`): a folder when `id` is set, otherwise a single server. */
export interface GuildFolder {
  id: number | null;
  name: string | null;
  color: number | null;
  guild_ids: Snowflake[];
}

/** Synced client preferences; sparse (a key is present once set). See docs/specs user settings sync. */
export interface UserPreferences {
  accent?: 'iris' | 'aurora' | 'ember' | 'rose' | 'citrine' | 'sky';
  reduce_motion?: boolean;
  font_scale?: number;
  show_avatars_in_compact?: boolean;
  link_previews?: boolean;
  saturation?: number;
  role_colors?: 'name' | 'dot' | 'hidden';
  link_underline?: boolean;
  message_spacing?: number;
  high_contrast?: boolean;
  animate_gifs?: boolean;
  animate_emoji?: boolean;
  animate_stickers?: boolean;
  tts_read_aloud?: boolean;
  tts_rate?: number;
  notify_only_mentions?: boolean;
  notify_sounds?: boolean;
  sound_toggles?: Record<string, boolean>;
  ringtone?: string;
  skin_tone?: string;
  recent_reactions?: { id: string | null; name: string; animated?: boolean }[];
}

export interface UserSettings {
  default_delivery_mode: DeliveryMode;
  /** Every call the user starts or joins is end-to-end encrypted (voice#8). */
  e2ee_calls_default?: boolean;
  status?: PresenceStatus;
  custom_status?: CustomStatus | null;
  theme?: 'dark' | 'light' | 'oled';
  locale?: string;
  developer_mode?: boolean;
  message_display_compact?: boolean;
  preferences?: UserPreferences;
  friend_source_flags?: { all?: boolean; mutual_friends?: boolean; mutual_guilds?: boolean };
  guild_positions?: Snowflake[];
  guild_folders?: GuildFolder[];
  delivery_overrides?: Record<Snowflake, DeliveryMode>;
}

export interface Role {
  id: Snowflake;
  name: string;
  color: number;
  hoist: boolean;
  icon?: string | null;
  unicode_emoji?: string | null;
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
  /** Voice channels only; absent or true means the channel chat accepts messages. */
  text_chat_enabled?: boolean;
  last_message_id?: Snowflake | null;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  recipients?: User[];
  icon?: string | null;
  unicode_emoji?: string | null;
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
  /** AttachmentFlag bits (IS_SPOILER). */
  flags?: number;
}

export const AttachmentFlag = {
  IS_SPOILER: 1 << 3,
} as const;

export interface EmbedMedia {
  url: string;
  /** Signed media-proxy URL on the CDN host; load this instead of `url`. */
  proxy_url?: string;
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
  footer?: { text: string; icon_url?: string; proxy_icon_url?: string };
  image?: EmbedMedia;
  thumbnail?: EmbedMedia;
  video?: EmbedMedia;
  provider?: { name?: string; url?: string };
  author?: { name: string; url?: string; icon_url?: string; proxy_icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

export interface Reaction {
  count: number;
  me: boolean;
  emoji: Emoji;
}

export interface MessageReference {
  /** 0 reply (default), 1 forward. */
  type?: number;
  message_id?: Snowflake;
  channel_id?: Snowflake;
  guild_id?: Snowflake;
  fail_if_not_exists?: boolean;
}

/** A frozen copy of a forwarded message (Discord `message_snapshots`). */
export interface MessageSnapshot {
  message: Pick<Message, 'content' | 'timestamp' | 'edited_timestamp' | 'mentions' | 'mention_roles' | 'attachments' | 'embeds' | 'type' | 'flags'>;
}

export interface MessageCall {
  participants?: Snowflake[];
  ended_timestamp?: string | null;
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
  /** Present when `message_reference.type` is 1 (forward). */
  message_snapshots?: MessageSnapshot[];
  thread?: Channel;
  /** Type 3 (CALL): participants and when it ended (Discord shape). Not produced by the backend yet. */
  call?: MessageCall;
  application_id?: Snowflake;
  components?: MessageComponent[];
  interaction_metadata?: InteractionMetadata;
  /** Search results only: true for the match, absent for its context messages. */
  hit?: boolean;
}

/** `GET /guilds/{id}/messages/search` and `GET /channels/{id}/messages/search`. */
export interface MessageSearchResponse {
  total_results: number;
  /** One group per hit, oldest first; the hit carries `hit: true`. */
  messages: Message[][];
  index_building?: boolean;
}

export const MessageFlag = {
  SUPPRESS_EMBEDS: 1 << 2,
  EPHEMERAL: 1 << 6,
  LOADING: 1 << 7,
  /** `@silent`: no push, desktop or unread-mention notification. */
  SUPPRESS_NOTIFICATIONS: 1 << 12,
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
  unicode_emoji?: string | null;
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

/** GET /users/{id}/profile: the user plus servers and friends shared with the caller. */
export interface UserProfile {
  user: User;
  mutual_guilds: { id: Snowflake; nick?: string | null }[];
  mutual_friends: User[];
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
  /** Login answered 60008: the ticket completes the login with a second factor. */
  ticket?: string;
  retry_after?: number;
}

export interface TotpEnrollment {
  secret: string;
  otpauth_uri: string;
}

export interface BackupCode {
  /** Plaintext, present only right after generation. */
  code?: string;
  consumed: boolean;
}

export interface AccountChange {
  username?: string;
  email?: string;
  new_password?: string;
  /** The current password; required for the three fields above. */
  password: string;
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
  attachments?: { id: string; filename: string; uploaded_filename: string; description?: string; flags?: number }[];
  message_reference?: MessageReference;
  embeds?: Embed[];
  tts?: boolean;
  /** Only SUPPRESS_NOTIFICATIONS is accepted from users. */
  flags?: number;
  /** `replied_user: false` replies without pinging the replied-to author. */
  allowed_mentions?: { replied_user?: boolean };
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

/** 0 all messages, 1 only @mentions, 2 nothing; null inherits (guild level, then the server default). */
export type NotificationLevel = 0 | 1 | 2;

/** `end_time` null means until turned off; a past `end_time` is an expired mute and is ignored. */
export interface MuteConfig {
  end_time: string | null;
}

export interface ChannelNotificationOverride {
  channel_id: Snowflake;
  message_notifications: NotificationLevel | null;
  muted: boolean;
  mute_config: MuteConfig | null;
}

/** The user's notification settings for one guild; `guild_id` null is the user's DMs. */
export interface GuildNotificationSettings {
  guild_id: Snowflake | null;
  message_notifications: NotificationLevel | null;
  suppress_everyone: boolean;
  suppress_roles: boolean;
  muted: boolean;
  mute_config: MuteConfig | null;
  hide_muted_channels: boolean;
  channel_overrides: ChannelNotificationOverride[];
}

export interface MuteConfigInput {
  end_time?: string | null;
  /** Seconds from now, or -1 for until turned off. */
  selected_time_window?: number | null;
}

export interface GuildNotificationSettingsPatch {
  message_notifications?: NotificationLevel | 3 | null;
  suppress_everyone?: boolean;
  suppress_roles?: boolean;
  muted?: boolean;
  mute_config?: MuteConfigInput | null;
  hide_muted_channels?: boolean;
  channel_overrides?: {
    channel_id: Snowflake;
    message_notifications?: NotificationLevel | 3 | null;
    muted?: boolean;
    mute_config?: MuteConfigInput | null;
  }[];
}

export interface UserNote {
  user_id: Snowflake;
  note_user_id: Snowflake;
  note: string;
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
  user_guild_settings?: GuildNotificationSettings[];
  /** Private notes keyed by the noted user's id. */
  notes?: Record<Snowflake, string>;
  read_state?: { id: Snowflake; last_message_id: Snowflake | null; mention_count: number }[];
  presences?: PresenceUpdate[];
  turn?: TurnCredentials;
}

/** A role of a server template; ids are template-local (0 is @everyone). */
export interface TemplateRole {
  id: number;
  name: string;
  permissions: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
}

export interface TemplateOverwrite {
  id: number;
  type: number;
  allow: string;
  deny: string;
}

export interface TemplateChannel {
  id: number;
  type: number;
  name: string;
  position: number;
  topic: string | null;
  nsfw: boolean;
  parent_id: number | null;
  permission_overwrites: TemplateOverwrite[];
}

/** The structure a template creates. */
export interface TemplateSourceGuild {
  name: string;
  description: string | null;
  afk_channel_id: number | null;
  system_channel_id: number | null;
  roles: TemplateRole[];
  channels: TemplateChannel[];
}

/** A server template (Discord guild template). Built-ins have a `builtin-` code and no creator. */
export interface GuildTemplate {
  code: string;
  name: string;
  description: string | null;
  usage_count: number;
  creator_id: string | null;
  creator: User | null;
  created_at: string;
  updated_at: string;
  source_guild_id: string | null;
  serialized_source_guild: TemplateSourceGuild;
  is_dirty: boolean;
}

/** One server card of `GET /discovery/guilds`. */
export interface DiscoveryGuild {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  category: string;
  tags: string[];
  approximate_member_count: number;
  approximate_presence_count: number | null;
}

export interface DiscoveryPage {
  guilds: DiscoveryGuild[];
  total: number;
  offset: number;
  limit: number;
}

export interface DiscoveryQuery {
  query?: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

/** `GET|PUT /guilds/{id}/discovery`: a server's opt-in listing and what blocks it. */
export interface GuildDiscoverySettings {
  enabled: boolean;
  category: string | null;
  tags: string[];
  listed_at: string | null;
  member_count: number;
  blockers: string[];
}
