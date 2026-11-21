/** REST port (P9). Implemented by `infrastructure/http/discordyApi.ts`. */
import type { SearchParams } from '../../domain/messageSearch';
import type { BotAuthorizationRequest } from '../../domain/botAuthorization';
import type { CreateReportBody } from '../../domain/reportModel';
import type { CreateScheduledMessage, EditScheduledMessage, ScheduledMessage, ScheduledMessagePage } from '../../contracts/scheduledMessages';
import type {
  LinkedConnection,
  ApplicationCommand,
  ApplicationSummary,
  ApplicationAuthorization,
  BotAuthorizationInfo,
  GuildIntegration,
  Webhook,
  WebhookCredential,
  WebhookEdit,
  AttachmentUploadSlot,
  AuditLog,
  AccountChange,
  AuthResponse,
  BackupCode,
  Passkey,
  PasskeyChallenge,
  PasskeyFinish,
  PasskeyRegistration,
  TotpEnrollment,
  Ban,
  Channel,
  CommandIndex,
  CreateInteractionBody,
  CreateMessageBody,
  EditMessageBody,
  DeliveryMode,
  AuthSession,
  Device,
  Emoji,
  Guild,
  VanityUrl,
  GuildNotificationSettings,
  GuildNotificationSettingsPatch,
  DiscoveryPage,
  GuildTemplate,
  DiscoveryQuery,
  GuildDiscoverySettings,
  GuildFull,
  GuildMember,
  OnboardingConfig,
  OnboardingResponse,
  Invite,
  Message,
  MessageSearchResponse,
  PermissionOverwrite,
  Relationship,
  Role,
  User,
  UserProfile,
  UserSettings,
  VoiceRegion,
} from '../../contracts/rest';

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
  connections(): Promise<LinkedConnection[]>;
  userConnections(userId: string): Promise<LinkedConnection[]>;
  authorizeGithubConnection(): Promise<{ url: string }>;
  setConnectionVisibility(provider: string, visible: boolean): Promise<void>;
  deleteConnection(provider: string): Promise<void>;
  register(body: { email: string; username: string; password: string }): Promise<AuthResponse>;
  login(body: { email: string; password: string; totp?: string }): Promise<AuthResponse>;
  logout(): Promise<void>;
  loginMfa(body: { ticket: string; code: string }): Promise<AuthResponse>;
  startPasskeyLogin(ticket: string): Promise<PasskeyChallenge>;
  finishPasskeyLogin(body: PasskeyFinish & { ticket: string }): Promise<AuthResponse>;
  passkeys(): Promise<Passkey[]>;
  startPasskeyRegistration(password: string, name: string): Promise<PasskeyChallenge>;
  finishPasskeyRegistration(body: PasskeyFinish): Promise<PasskeyRegistration>;
  renamePasskey(id: string, name: string): Promise<Passkey>;
  removePasskey(id: string, password: string, code: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  resendVerification(): Promise<void>;
  changeAccount(change: AccountChange): Promise<User>;
  enableTotp(password: string): Promise<TotpEnrollment>;
  verifyTotp(code: string): Promise<BackupCode[]>;
  disableTotp(password: string, code: string): Promise<void>;
  backupCodes(password: string, regenerate: boolean): Promise<BackupCode[]>;
  disableAccount(password: string): Promise<void>;
  deleteAccount(password: string): Promise<void>;

  registerDevice(body: { name: string; identity_key_b64: string }): Promise<{ device_id: string }>;
  uploadKeyPackages(deviceId: string, packages: string[]): Promise<void>;
  listUserDevices(userId: string): Promise<Device[]>;
  claimKeyPackage(userId: string, deviceId: string): Promise<{ package_b64: string }>;

  listSessions(): Promise<AuthSession[]>;
  /** Logs out one other session: its tokens stop working and its live connection closes. */
  revokeSession(sessionId: string): Promise<void>;
  /** Logs out every session except the current one. */
  logoutOtherSessions(): Promise<void>;

  me(): Promise<User>;
  updateMe(patch: Partial<Pick<User, 'username' | 'global_name' | 'avatar' | 'banner' | 'bio' | 'accent_color'>>): Promise<User>;
  user(userId: string): Promise<User>;
  userProfile(userId: string): Promise<UserProfile>;
  settings(): Promise<UserSettings>;
  updateSettings(patch: Partial<UserSettings>): Promise<UserSettings>;
  gifs(query?: string): Promise<{ results: { id: string; content_description?: string; media_formats: { gif?: { url: string }; tinygif?: { url: string; proxy_url?: string } } }[] }>;
  gifCategories(): Promise<{ tags: { searchterm: string; name: string }[] }>;
  gifPreviews(urls: string[]): Promise<{ urls: string[] }>;
  privateChannels(): Promise<Channel[]>;
  openPrivateChannel(recipientIds: string[]): Promise<Channel>;
  setChannelDeliveryOverride(channelId: string, mode: DeliveryMode | null): Promise<void>;
  relationships(): Promise<Relationship[]>;
  favouriteFriends(): Promise<string[]>;
  setFavouriteFriend(userId: string, value: boolean): Promise<void>;
  createFriendInvite(): Promise<{ token: string; expires_at: string }>;
  revokeFriendInvites(): Promise<void>;
  useFriendInvite(token: string): Promise<void>;
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
  /** Reports a message or a user to the moderators; resolves with no body whether or not the report is new. */
  createReport(body: CreateReportBody): Promise<void>;

  createGuild(body: { name: string; icon?: string | null }): Promise<GuildFull>;
  builtinGuildTemplates(): Promise<GuildTemplate[]>;
  guildTemplate(code: string): Promise<GuildTemplate>;
  createGuildFromTemplate(code: string, body: { name: string; icon?: string | null }): Promise<GuildFull>;
  guildTemplates(guildId: string): Promise<GuildTemplate[]>;
  createGuildTemplate(guildId: string, body: { name: string; description?: string | null }): Promise<GuildTemplate>;
  modifyGuildTemplate(guildId: string, code: string, body: { name?: string; description?: string | null }): Promise<GuildTemplate>;
  syncGuildTemplate(guildId: string, code: string): Promise<GuildTemplate>;
  deleteGuildTemplate(guildId: string, code: string): Promise<void>;
  guild(guildId: string): Promise<Guild>;
  updateGuild(guildId: string, patch: Partial<Guild>): Promise<Guild>;
  guildVanityUrl(guildId: string): Promise<VanityUrl>;
  updateGuildVanityUrl(guildId: string, code: string | null): Promise<VanityUrl>;
  deleteGuild(guildId: string): Promise<void>;
  createChannel(guildId: string, body: CreateChannelBody): Promise<Channel>;
  reorderChannels(guildId: string, positions: { id: string; position: number; parent_id?: string | null; lock_permissions?: boolean }[]): Promise<void>;
  roles(guildId: string): Promise<Role[]>;
  createRole(guildId: string, body: Partial<Role>): Promise<Role>;
  updateRole(guildId: string, roleId: string, patch: Partial<Role>): Promise<Role>;
  deleteRole(guildId: string, roleId: string): Promise<void>;
  duplicateRole(guildId: string, roleId: string): Promise<Role>;
  reorderRoles(guildId: string, positions: { id: string; position: number }[]): Promise<Role[]>;
  members(guildId: string, query?: { limit?: number; after?: string }): Promise<GuildMember[]>;
  updateMember(guildId: string, userId: string, patch: Partial<Pick<GuildMember, 'nick' | 'avatar' | 'banner' | 'bio' | 'roles' | 'mute' | 'deaf' | 'communication_disabled_until'>> & { channel_id?: string | null }): Promise<GuildMember>;
  kickMember(guildId: string, userId: string, reason?: string): Promise<void>;
  addMemberRole(guildId: string, userId: string, roleId: string): Promise<void>;
  removeMemberRole(guildId: string, userId: string, roleId: string): Promise<void>;
  bans(guildId: string): Promise<Ban[]>;
  ban(guildId: string, userId: string, reason?: string, options?: { delete_message_seconds?: number }): Promise<void>;
  unban(guildId: string, userId: string): Promise<void>;
  /** The ban of one user; 404 when they are not banned. */
  getBan(guildId: string, userId: string): Promise<Ban>;
  /** Dry run: how many members a prune would remove. */
  pruneCount(guildId: string, days: number): Promise<{ pruned: number }>;
  prune(guildId: string, days: number): Promise<{ pruned: number }>;
  auditLog(guildId: string, query?: { limit?: number; before?: string; user_id?: string; action_type?: number; target_id?: string }): Promise<AuditLog>;
  bulkDeleteMessages(channelId: string, messageIds: string[]): Promise<void>;
  emojis(guildId: string): Promise<Emoji[]>;
  createEmoji(guildId: string, body: { name: string; image: string }): Promise<Emoji>;
  updateEmoji(guildId: string, emojiId: string, patch: { name: string }): Promise<Emoji>;
  deleteEmoji(guildId: string, emojiId: string): Promise<void>;
  guildInvites(guildId: string): Promise<Invite[]>;
  memberVerification(guildId: string): Promise<{ enabled: boolean; rules: string[]; revision: number; pending: boolean }>;
  setMemberVerification(guildId: string, body: { enabled: boolean; rules: string[] }): Promise<{ enabled: boolean; rules: string[]; revision: number; pending: boolean }>;
  acceptMemberVerification(guildId: string, revision: number): Promise<void>;
  welcomeScreen(guildId: string): Promise<{ enabled: boolean; description: string; channels: { channel_id: string; description: string }[] }>;
  setWelcomeScreen(guildId: string, body: { enabled: boolean; description: string; channels: { channel_id: string; description: string }[] }): Promise<{ enabled: boolean; description: string; channels: { channel_id: string; description: string }[] }>;
  onboarding(guildId: string): Promise<OnboardingResponse>;
  setOnboarding(guildId: string, body: OnboardingConfig): Promise<OnboardingResponse>;
  completeOnboarding(guildId: string, revision: number, choices: number[]): Promise<{ channel_ids: string[] }>;

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
  listForumPosts(channelId: string): Promise<Channel[]>;
  createThread(channelId: string, body: { name: string; message_id?: string; type?: number; auto_archive_duration?: number; applied_tags?: string[]; request_id?: string; message?: { content: string } }): Promise<Channel>;

  discoveryGuilds(query?: DiscoveryQuery): Promise<DiscoveryPage>;
  discoveryCategories(): Promise<string[]>;
  joinDiscoveryGuild(guildId: string): Promise<void>;
  guildDiscovery(guildId: string): Promise<GuildDiscoverySettings>;
  putGuildDiscovery(guildId: string, body: { enabled: boolean; category?: string | null; tags?: string[] }): Promise<GuildDiscoverySettings>;

  invite(code: string): Promise<Invite>;
  acceptInvite(code: string): Promise<Invite>;
  deleteInvite(code: string): Promise<void>;

  messages(channelId: string, query?: MessageQuery): Promise<Message[]>;
  /** Server-side full-text search; `guildId` searches the whole server, otherwise just the channel. */
  searchMessages(scope: { guildId?: string | null; channelId: string }, params: SearchParams): Promise<MessageSearchResponse>;
  sendMessage(channelId: string, body: CreateMessageBody): Promise<Message>;
  createScheduledMessage(channelId: string, body: CreateScheduledMessage): Promise<ScheduledMessage>;
  scheduledMessages(channelId: string, query?: { after?: string; limit?: number }): Promise<ScheduledMessagePage>;
  scheduledMessage(channelId: string, scheduleId: string): Promise<ScheduledMessage>;
  editScheduledMessage(channelId: string, scheduleId: string, body: EditScheduledMessage): Promise<ScheduledMessage>;
  cancelScheduledMessage(channelId: string, scheduleId: string, expectedRevision: number): Promise<ScheduledMessage>;
  editMessage(channelId: string, messageId: string, patch: EditMessageBody): Promise<Message>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>;
  removeReaction(channelId: string, messageId: string, emoji: string): Promise<void>;
  pins(channelId: string): Promise<Message[]>;
  pin(channelId: string, messageId: string): Promise<void>;
  unpin(channelId: string, messageId: string): Promise<void>;
  /** `manual` sets the read marker to exactly this message, even backwards (Mark Unread). */
  ack(channelId: string, messageId: string, options?: { manual?: boolean; mentionCount?: number }): Promise<void>;
  createAttachmentSlots(channelId: string, files: { filename: string; file_size: number }[]): Promise<{ attachments: AttachmentUploadSlot[] }>;
  /** Fresh signed download URLs for attachments of a channel, given their object keys or earlier URLs. */
  refreshAttachmentUrls(channelId: string, urls: string[]): Promise<{ refreshed_urls: { original: string; refreshed: string }[] }>;
  upload(url: string, file: Blob, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void>;

  voiceRegions(): Promise<VoiceRegion[]>;

  applications(): Promise<ApplicationSummary[]>;
  botAuthorizationInfo(request: BotAuthorizationRequest): Promise<BotAuthorizationInfo>;
  authorizeBot(request: BotAuthorizationRequest & { guild_id: string; installation_revision: string }): Promise<{ location: string }>;
  applicationAuthorizations(): Promise<ApplicationAuthorization[]>;
  revokeApplicationAuthorization(authorizationId: string): Promise<void>;
  guildIntegrations(guildId: string): Promise<GuildIntegration[]>;
  removeGuildIntegration(guildId: string, applicationId: string): Promise<void>;
  guildWebhooks(guildId: string): Promise<Webhook[]>;
  followAnnouncement(channelId: string, targetChannelId: string): Promise<{ channel_id: string; webhook_id: string }>;
  publishAnnouncement(channelId: string, messageId: string): Promise<Message>;
  followedChannels(guildId: string): Promise<{ channel_id: string; webhook_channel_id: string; webhook_id: string }[]>;
  createWebhook(channelId: string, body: { name: string; avatar?: string }): Promise<WebhookCredential>;
  updateWebhook(webhookId: string, body: WebhookEdit): Promise<Webhook>;
  resetWebhookToken(webhookId: string): Promise<WebhookCredential>;
  deleteWebhook(webhookId: string): Promise<void>;
  globalCommands(applicationId: string): Promise<ApplicationCommand[]>;
  createApplication(body: { name: string; description?: string }): Promise<ApplicationSummary>;
  /** Issues a new bot token and invalidates the old one. The token is returned once; callers must not persist or log it. */
  resetBotToken(applicationId: string): Promise<{ token: string }>;
  createCommand(applicationId: string, body: { type: number; name: string; description: string }): Promise<ApplicationCommand>;
  deleteCommand(applicationId: string, commandId: string): Promise<void>;
  commandIndex(guildId: string): Promise<CommandIndex>;
  createInteraction(body: CreateInteractionBody): Promise<{ id: string }>;
}
