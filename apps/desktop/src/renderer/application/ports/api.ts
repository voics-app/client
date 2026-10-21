/** REST port (P9). Implemented by `infrastructure/http/discordyApi.ts`. */
import type {
  ApplicationCommand,
  ApplicationSummary,
  AttachmentUploadSlot,
  AuditLog,
  AuthResponse,
  Ban,
  Channel,
  CommandIndex,
  CreateInteractionBody,
  CreateMessageBody,
  DeliveryMode,
  Device,
  Emoji,
  Guild,
  GuildNotificationSettings,
  GuildNotificationSettingsPatch,
  GuildFull,
  GuildMember,
  Invite,
  Message,
  PermissionOverwrite,
  Relationship,
  Role,
  User,
  UserSettings,
  VoiceRegion,
} from '@shared/contracts/rest';

export interface MessageQuery {
  before?: string;
  after?: string;
  around?: string;
  limit?: number;
}

export interface CreateChannelBody {
  name: string;
  type: number;
  parent_id?: string | null;
  topic?: string | null;
  permission_overwrites?: PermissionOverwrite[];
  delivery_mode?: DeliveryMode;
  voice_region?: string | null;
  user_limit?: number;
  bitrate?: number;
  nsfw?: boolean;
  rate_limit_per_user?: number;
}

export interface ApiPort {
  register(body: { email: string; username: string; password: string }): Promise<AuthResponse>;
  login(body: { email: string; password: string; totp?: string }): Promise<AuthResponse>;
  logout(): Promise<void>;

  registerDevice(body: { name: string; identity_key_b64: string }): Promise<{ device_id: string }>;
  uploadKeyPackages(deviceId: string, packages: string[]): Promise<void>;
  listUserDevices(userId: string): Promise<Device[]>;
  claimKeyPackage(userId: string, deviceId: string): Promise<{ package_b64: string }>;

  me(): Promise<User>;
  updateMe(patch: Partial<Pick<User, 'username' | 'global_name' | 'avatar' | 'banner' | 'bio' | 'accent_color'>>): Promise<User>;
  user(userId: string): Promise<User>;
  settings(): Promise<UserSettings>;
  updateSettings(patch: Partial<UserSettings>): Promise<UserSettings>;
  privateChannels(): Promise<Channel[]>;
  openPrivateChannel(recipientIds: string[]): Promise<Channel>;
  setChannelDeliveryOverride(channelId: string, mode: DeliveryMode | null): Promise<void>;
  relationships(): Promise<Relationship[]>;
  /** `guildId` null addresses the user's DMs (`@me`). */
  guildNotificationSettings(guildId: string | null): Promise<GuildNotificationSettings>;
  updateGuildNotificationSettings(guildId: string | null, patch: GuildNotificationSettingsPatch): Promise<GuildNotificationSettings>;
  /** The private note about a user; resolves '' when there is none. */
  userNote(userId: string): Promise<string>;
  /** An empty note deletes it. */
  putUserNote(userId: string, note: string): Promise<void>;
  sendFriendRequest(username: string): Promise<void>;
  putRelationship(userId: string, body?: { type?: number; username?: string }): Promise<void>;
  deleteRelationship(userId: string): Promise<void>;

  createGuild(body: { name: string; icon?: string | null }): Promise<GuildFull>;
  guild(guildId: string): Promise<Guild>;
  updateGuild(guildId: string, patch: Partial<Guild>): Promise<Guild>;
  deleteGuild(guildId: string): Promise<void>;
  createChannel(guildId: string, body: CreateChannelBody): Promise<Channel>;
  reorderChannels(guildId: string, positions: { id: string; position: number; parent_id?: string | null }[]): Promise<void>;
  roles(guildId: string): Promise<Role[]>;
  createRole(guildId: string, body: Partial<Role>): Promise<Role>;
  updateRole(guildId: string, roleId: string, patch: Partial<Role>): Promise<Role>;
  deleteRole(guildId: string, roleId: string): Promise<void>;
  members(guildId: string, query?: { limit?: number; after?: string }): Promise<GuildMember[]>;
  updateMember(guildId: string, userId: string, patch: Partial<Pick<GuildMember, 'nick' | 'roles' | 'mute' | 'deaf' | 'communication_disabled_until'>> & { channel_id?: string | null }): Promise<GuildMember>;
  kickMember(guildId: string, userId: string, reason?: string): Promise<void>;
  addMemberRole(guildId: string, userId: string, roleId: string): Promise<void>;
  removeMemberRole(guildId: string, userId: string, roleId: string): Promise<void>;
  bans(guildId: string): Promise<Ban[]>;
  ban(guildId: string, userId: string, reason?: string, options?: { delete_message_seconds?: number }): Promise<void>;
  unban(guildId: string, userId: string): Promise<void>;
  auditLog(guildId: string, query?: { limit?: number; before?: string }): Promise<AuditLog>;
  emojis(guildId: string): Promise<Emoji[]>;
  createEmoji(guildId: string, body: { name: string; image: string }): Promise<Emoji>;
  updateEmoji(guildId: string, emojiId: string, patch: { name: string }): Promise<Emoji>;
  deleteEmoji(guildId: string, emojiId: string): Promise<void>;
  guildInvites(guildId: string): Promise<Invite[]>;

  channel(channelId: string): Promise<Channel>;
  updateChannel(channelId: string, patch: Partial<Channel>): Promise<Channel>;
  deleteChannel(channelId: string): Promise<void>;
  /** Group DM: add a member (any member), remove one (owner) or leave (`'@me'`). */
  addGroupRecipient(channelId: string, userId: string): Promise<void>;
  removeGroupRecipient(channelId: string, userId: string): Promise<void>;
  putOverwrite(channelId: string, overwrite: PermissionOverwrite): Promise<void>;
  deleteOverwrite(channelId: string, overwriteId: string): Promise<void>;
  createInvite(channelId: string, body?: { max_age?: number; max_uses?: number }): Promise<Invite>;
  typing(channelId: string): Promise<void>;
  createThread(channelId: string, body: { name: string; message_id?: string; type?: number; auto_archive_duration?: number; message?: { content: string } }): Promise<Channel>;

  invite(code: string): Promise<Invite>;
  acceptInvite(code: string): Promise<Invite>;
  deleteInvite(code: string): Promise<void>;

  messages(channelId: string, query?: MessageQuery): Promise<Message[]>;
  sendMessage(channelId: string, body: CreateMessageBody): Promise<Message>;
  editMessage(channelId: string, messageId: string, patch: { content?: string; flags?: number }): Promise<Message>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>;
  removeReaction(channelId: string, messageId: string, emoji: string): Promise<void>;
  pins(channelId: string): Promise<Message[]>;
  pin(channelId: string, messageId: string): Promise<void>;
  unpin(channelId: string, messageId: string): Promise<void>;
  ack(channelId: string, messageId: string): Promise<void>;
  createAttachmentSlots(channelId: string, files: { filename: string; file_size: number }[]): Promise<{ attachments: AttachmentUploadSlot[] }>;
  /** Fresh signed download URLs for attachments of a channel, given their object keys or earlier URLs. */
  refreshAttachmentUrls(channelId: string, urls: string[]): Promise<{ refreshed_urls: { original: string; refreshed: string }[] }>;
  upload(url: string, file: Blob, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void>;

  voiceRegions(): Promise<VoiceRegion[]>;

  applications(): Promise<ApplicationSummary[]>;
  globalCommands(applicationId: string): Promise<ApplicationCommand[]>;
  commandIndex(guildId: string): Promise<CommandIndex>;
  createInteraction(body: CreateInteractionBody): Promise<{ id: string }>;
}
