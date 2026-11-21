/** Typed P9 endpoints over the HttpClient. Paths mirror the master plan exactly. */
import type { ApiPort, CreateChannelBody, MessageQuery } from '../../application/ports/api';
import type { CreateReportBody } from '../../domain/reportModel';
import type { CreateScheduledMessage, EditScheduledMessage, ScheduledMessage, ScheduledMessagePage } from '../../contracts/scheduledMessages';
import type { BotAuthorizationRequest } from '../../domain/botAuthorization';
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
  PushTokenBody,
  VoipTokenBody,
  Device,
  Emoji,
  Guild,
  VanityUrl,
  DiscoveryPage,
  GuildTemplate,
  DiscoveryQuery,
  GuildDiscoverySettings,
  GuildFull,
  GuildNotificationSettings,
  GuildNotificationSettingsPatch,
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
  UserNote,
  UserSettings,
  VoiceRegion,
} from '../../contracts/rest';
import { toQuery, type SearchParams } from '../../domain/messageSearch';
import type { HttpClient, RequestOptions } from './httpClient';

const enc = encodeURIComponent;

export class DiscordyApi implements ApiPort {
  constructor(private readonly http: HttpClient) {}

  private get<T>(path: string, query?: RequestOptions['query']) {
    return this.http.request<T>('GET', path, { query });
  }
  private post<T>(path: string, body?: unknown, reason?: string) {
    return this.http.request<T>('POST', path, { body: body ?? {}, reason });
  }
  private patch<T>(path: string, body: unknown) {
    return this.http.request<T>('PATCH', path, { body });
  }
  private put<T>(path: string, body?: unknown, reason?: string) {
    return this.http.request<T>('PUT', path, { body, reason });
  }
  private del<T>(path: string, reason?: string) {
    return this.http.request<T>('DELETE', path, { reason });
  }

  connections() { return this.get<LinkedConnection[]>('/users/@me/connections'); }
  userConnections(userId: string) { return this.get<LinkedConnection[]>(`/users/${enc(userId)}/connections`); }
  authorizeGithubConnection() { return this.post<{ url: string }>('/users/@me/connections/github/authorize'); }
  setConnectionVisibility(provider: string, visible: boolean) { return this.put<void>(`/users/@me/connections/${enc(provider)}`, { visible }); }
  deleteConnection(provider: string) { return this.del<void>(`/users/@me/connections/${enc(provider)}`); }

  register(body: { email: string; username: string; password: string }) {
    return this.http.request<AuthResponse>('POST', '/auth/register', { body, auth: false });
  }
  login(body: { email: string; password: string; totp?: string }) {
    return this.http.request<AuthResponse>('POST', '/auth/login', { body, auth: false });
  }
  logout() {
    return this.post<void>('/auth/logout');
  }
  loginMfa(body: { ticket: string; code: string }) {
    return this.http.request<AuthResponse>('POST', '/auth/mfa/totp', { body, auth: false });
  }
  startPasskeyLogin(ticket: string) {
    return this.http.request<PasskeyChallenge>('POST', '/auth/mfa/webauthn/start', { body: { ticket }, auth: false });
  }
  finishPasskeyLogin(body: PasskeyFinish & { ticket: string }) {
    return this.http.request<AuthResponse>('POST', '/auth/mfa/webauthn/finish', { body, auth: false });
  }
  passkeys() {
    return this.get<Passkey[]>('/users/@me/mfa/passkeys');
  }
  startPasskeyRegistration(password: string, name: string) {
    return this.post<PasskeyChallenge>('/users/@me/mfa/passkeys/register/start', { password, name });
  }
  finishPasskeyRegistration(body: PasskeyFinish) {
    return this.post<PasskeyRegistration>('/users/@me/mfa/passkeys/register/finish', body);
  }
  renamePasskey(id: string, name: string) {
    return this.patch<Passkey>(`/users/@me/mfa/passkeys/${enc(id)}`, { name });
  }
  async removePasskey(id: string, password: string, code: string) {
    await this.http.request<void>('DELETE', `/users/@me/mfa/passkeys/${enc(id)}`, { body: { password, code } });
  }
  async forgotPassword(email: string) {
    await this.http.request('POST', '/auth/forgot-password', { body: { email }, auth: false });
  }
  async resetPassword(token: string, password: string) {
    await this.http.request('POST', '/auth/reset-password', { body: { token, password }, auth: false });
  }
  async verifyEmail(token: string) {
    await this.http.request('POST', '/auth/verify-email', { body: { token }, auth: false });
  }
  async resendVerification() {
    await this.post<void>('/auth/resend-verification');
  }
  changeAccount(change: AccountChange) {
    return this.patch<User>('/users/@me', change);
  }
  enableTotp(password: string) {
    return this.post<TotpEnrollment>('/users/@me/mfa/totp/enable', { password });
  }
  async verifyTotp(code: string) {
    return (await this.post<{ backup_codes: BackupCode[] }>('/users/@me/mfa/totp/verify', { code })).backup_codes;
  }
  async disableTotp(password: string, code: string) {
    await this.post<void>('/users/@me/mfa/totp/disable', { password, code });
  }
  async backupCodes(password: string, regenerate: boolean) {
    return (await this.post<{ backup_codes: BackupCode[] }>('/users/@me/mfa/codes-verification', { password, regenerate })).backup_codes;
  }
  async disableAccount(password: string) {
    await this.post<void>('/users/@me/disable', { password });
  }
  async deleteAccount(password: string) {
    await this.post<void>('/users/@me/delete', { password });
  }

  registerDevice(body: { name: string; identity_key_b64: string }) {
    return this.post<{ device_id: string }>('/devices', body);
  }
  uploadKeyPackages(deviceId: string, packages: string[]) {
    return this.post<void>(`/devices/${deviceId}/key-packages`, { packages });
  }
  listUserDevices(userId: string) {
    return this.get<Device[]>(`/users/${userId}/devices`);
  }
  claimKeyPackage(userId: string, deviceId: string) {
    return this.post<{ package_b64: string }>(`/users/${userId}/devices/${deviceId}/key-packages/claim`);
  }

  /** Stores the push token of this session (the app calls it on every start, so a rotated token is refreshed the same way). */
  registerPushToken(body: PushTokenBody) {
    return this.post<void>('/users/@me/devices/push', body);
  }
  /** Removes the push token of this session, and its VoIP token with it. Removing one that is not there is fine. */
  removePushToken() {
    return this.del<void>('/users/@me/devices/push');
  }
  /** Stores the PushKit (VoIP) token of this session, which rings the phone for a call while the app is closed. Independent of the notification token. */
  registerVoipToken(body: VoipTokenBody) {
    return this.post<void>('/users/@me/devices/voip', body);
  }
  /** Removes the VoIP token of this session only. */
  removeVoipToken() {
    return this.del<void>('/users/@me/devices/voip');
  }

  listSessions() {
    return this.get<AuthSession[]>('/users/@me/sessions');
  }
  revokeSession(sessionId: string) {
    return this.del<void>(`/users/@me/sessions/${sessionId}`);
  }
  logoutOtherSessions() {
    return this.post<void>('/users/@me/sessions/logout-all');
  }

  me() {
    return this.get<User>('/users/@me');
  }
  updateMe(patch: Partial<User>) {
    return this.patch<User>('/users/@me', patch);
  }
  user(userId: string) {
    return this.get<User>(`/users/${userId}`);
  }
  userProfile(userId: string) {
    return this.get<UserProfile>(`/users/${userId}/profile`);
  }
  settings() {
    return this.get<UserSettings>('/users/@me/settings');
  }
  updateSettings(patch: Partial<UserSettings>) {
    return this.patch<UserSettings>('/users/@me/settings', patch);
  }
  gifs(query?: string) {
    return this.get<{ results: { id: string; content_description?: string; media_formats: { gif?: { url: string }; tinygif?: { url: string; proxy_url?: string } } }[] }>(query ? '/gifs/search' : '/gifs/trending', query ? { q: query } : undefined);
  }
  gifCategories() {
    return this.get<{ tags: { searchterm: string; name: string }[] }>('/gifs/categories');
  }
  gifPreviews(urls: string[]) {
    return this.post<{ urls: string[] }>('/gifs/previews', { urls });
  }
  privateChannels() {
    return this.get<Channel[]>('/users/@me/channels');
  }
  openPrivateChannel(recipientIds: string[]) {
    return this.post<Channel>('/users/@me/channels', { recipient_ids: recipientIds });
  }
  setChannelDeliveryOverride(channelId: string, mode: DeliveryMode | null) {
    return this.put<void>(`/users/@me/channels/${channelId}/delivery-mode`, { mode });
  }
  relationships() {
    return this.get<Relationship[]>('/users/@me/relationships');
  }
  favouriteFriends() { return this.get<string[]>('/users/@me/favourites'); }
  setFavouriteFriend(userId: string, value: boolean) {
    return value ? this.put<void>(`/users/@me/favourites/${userId}`, {}) : this.del<void>(`/users/@me/favourites/${userId}`);
  }
  createFriendInvite() { return this.post<{ token: string; expires_at: string }>('/users/@me/friend-invites', {}); }
  revokeFriendInvites() { return this.del<void>('/users/@me/friend-invites'); }
  useFriendInvite(token: string) { return this.post<void>('/friend-invites', { token }); }
  guildNotificationSettings(guildId: string | null) {
    return this.get<GuildNotificationSettings>(`/users/@me/guilds/${guildId ?? '@me'}/settings`);
  }
  updateGuildNotificationSettings(guildId: string | null, patch: GuildNotificationSettingsPatch) {
    return this.patch<GuildNotificationSettings>(`/users/@me/guilds/${guildId ?? '@me'}/settings`, patch);
  }
  async userNote(userId: string) {
    try {
      return (await this.get<UserNote>(`/users/@me/notes/${userId}`)).note;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return '';
      throw error;
    }
  }
  putUserNote(userId: string, note: string) {
    return note ? this.put<void>(`/users/@me/notes/${userId}`, { note }) : this.del<void>(`/users/@me/notes/${userId}`);
  }
  sendFriendRequest(username: string) {
    return this.post<void>('/users/@me/relationships', { username });
  }
  putRelationship(userId: string, body: { type?: number; username?: string } = {}) {
    return this.put<void>(`/users/@me/relationships/${userId}`, body);
  }
  deleteRelationship(userId: string) {
    return this.del<void>(`/users/@me/relationships/${userId}`);
  }
  createReport(body: CreateReportBody) {
    return this.post<void>('/reports', body);
  }

  createGuild(body: { name: string; icon?: string | null }) {
    return this.post<GuildFull>('/guilds', body);
  }
  builtinGuildTemplates() {
    return this.get<GuildTemplate[]>('/guilds/templates');
  }
  guildTemplate(code: string) {
    return this.get<GuildTemplate>(`/guilds/templates/${encodeURIComponent(code)}`);
  }
  createGuildFromTemplate(code: string, body: { name: string; icon?: string | null }) {
    return this.post<GuildFull>(`/guilds/templates/${encodeURIComponent(code)}`, body);
  }
  guildTemplates(guildId: string) {
    return this.get<GuildTemplate[]>(`/guilds/${guildId}/templates`);
  }
  createGuildTemplate(guildId: string, body: { name: string; description?: string | null }) {
    return this.post<GuildTemplate>(`/guilds/${guildId}/templates`, body);
  }
  modifyGuildTemplate(guildId: string, code: string, body: { name?: string; description?: string | null }) {
    return this.patch<GuildTemplate>(`/guilds/${guildId}/templates/${encodeURIComponent(code)}`, body);
  }
  syncGuildTemplate(guildId: string, code: string) {
    return this.put<GuildTemplate>(`/guilds/${guildId}/templates/${encodeURIComponent(code)}`);
  }
  deleteGuildTemplate(guildId: string, code: string) {
    return this.del<void>(`/guilds/${guildId}/templates/${encodeURIComponent(code)}`);
  }
  guild(guildId: string) {
    return this.get<Guild>(`/guilds/${guildId}`);
  }
  updateGuild(guildId: string, patch: Partial<Guild>) {
    return this.patch<Guild>(`/guilds/${guildId}`, patch);
  }
  guildVanityUrl(guildId: string) {
    return this.get<VanityUrl>(`/guilds/${guildId}/vanity-url`);
  }
  updateGuildVanityUrl(guildId: string, code: string | null) {
    return this.patch<VanityUrl>(`/guilds/${guildId}/vanity-url`, { code });
  }
  deleteGuild(guildId: string) {
    return this.del<void>(`/guilds/${guildId}`);
  }
  createChannel(guildId: string, body: CreateChannelBody) {
    return this.post<Channel>(`/guilds/${guildId}/channels`, body);
  }
  reorderChannels(guildId: string, positions: { id: string; position: number; parent_id?: string | null; lock_permissions?: boolean }[]) {
    return this.patch<void>(`/guilds/${guildId}/channels`, positions);
  }
  roles(guildId: string) {
    return this.get<Role[]>(`/guilds/${guildId}/roles`);
  }
  createRole(guildId: string, body: Partial<Role>) {
    return this.post<Role>(`/guilds/${guildId}/roles`, body);
  }
  updateRole(guildId: string, roleId: string, patch: Partial<Role>) {
    return this.patch<Role>(`/guilds/${guildId}/roles/${roleId}`, patch);
  }
  duplicateRole(guildId: string, roleId: string) {
    return this.post<Role>(`/guilds/${guildId}/roles/${roleId}/duplicate`);
  }
  reorderRoles(guildId: string, positions: { id: string; position: number }[]) {
    return this.patch<Role[]>(`/guilds/${guildId}/roles`, positions);
  }
  deleteRole(guildId: string, roleId: string) {
    return this.del<void>(`/guilds/${guildId}/roles/${roleId}`);
  }
  members(guildId: string, query: { limit?: number; after?: string } = {}) {
    return this.get<GuildMember[]>(`/guilds/${guildId}/members`, { limit: query.limit ?? 1000, after: query.after });
  }
  updateMember(guildId: string, userId: string, patch: Partial<GuildMember> & { channel_id?: string | null }) {
    return this.patch<GuildMember>(`/guilds/${guildId}/members/${userId}`, patch);
  }
  kickMember(guildId: string, userId: string, reason?: string) {
    return this.del<void>(`/guilds/${guildId}/members/${userId}`, reason);
  }
  addMemberRole(guildId: string, userId: string, roleId: string) {
    return this.put<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`);
  }
  removeMemberRole(guildId: string, userId: string, roleId: string) {
    return this.del<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`);
  }
  bans(guildId: string) {
    return this.get<Ban[]>(`/guilds/${guildId}/bans`);
  }
  ban(guildId: string, userId: string, reason?: string, options: { delete_message_seconds?: number } = {}) {
    return this.put<void>(`/guilds/${guildId}/bans/${userId}`, options, reason);
  }
  unban(guildId: string, userId: string) {
    return this.del<void>(`/guilds/${guildId}/bans/${userId}`);
  }
  getBan(guildId: string, userId: string) {
    return this.get<Ban>(`/guilds/${guildId}/bans/${userId}`);
  }
  pruneCount(guildId: string, days: number) {
    return this.get<{ pruned: number }>(`/guilds/${guildId}/prune`, { days });
  }
  prune(guildId: string, days: number) {
    return this.post<{ pruned: number }>(`/guilds/${guildId}/prune`, { days });
  }
  auditLog(guildId: string, query: { limit?: number; before?: string; user_id?: string; action_type?: number; target_id?: string } = {}) {
    return this.get<AuditLog>(`/guilds/${guildId}/audit-logs`, { limit: query.limit ?? 50, before: query.before, user_id: query.user_id, action_type: query.action_type, target_id: query.target_id });
  }
  bulkDeleteMessages(channelId: string, messageIds: string[]) {
    return this.post<void>(`/channels/${channelId}/messages/bulk-delete`, { messages: messageIds });
  }
  emojis(guildId: string) {
    return this.get<Emoji[]>(`/guilds/${guildId}/emojis`);
  }
  createEmoji(guildId: string, body: { name: string; image: string }) {
    return this.post<Emoji>(`/guilds/${guildId}/emojis`, body);
  }
  updateEmoji(guildId: string, emojiId: string, patch: { name: string }) {
    return this.patch<Emoji>(`/guilds/${guildId}/emojis/${emojiId}`, patch);
  }
  deleteEmoji(guildId: string, emojiId: string) {
    return this.del<void>(`/guilds/${guildId}/emojis/${emojiId}`);
  }
  guildInvites(guildId: string) {
    return this.get<Invite[]>(`/guilds/${guildId}/invites`);
  }

  channel(channelId: string) {
    return this.get<Channel>(`/channels/${channelId}`);
  }
  updateChannel(channelId: string, patch: Partial<Channel>) {
    return this.patch<Channel>(`/channels/${channelId}`, patch);
  }
  deleteChannel(channelId: string) {
    return this.del<void>(`/channels/${channelId}`);
  }
  addGroupRecipient(channelId: string, userId: string) {
    return this.put<void>(`/channels/${channelId}/recipients/${userId}`);
  }
  removeGroupRecipient(channelId: string, userId: string) {
    return this.del<void>(`/channels/${channelId}/recipients/${userId}`);
  }
  putOverwrite(channelId: string, overwrite: PermissionOverwrite) {
    return this.put<void>(`/channels/${channelId}/permissions/${overwrite.id}`, overwrite);
  }
  deleteOverwrite(channelId: string, overwriteId: string) {
    return this.del<void>(`/channels/${channelId}/permissions/${overwriteId}`);
  }
  createInvite(channelId: string, body: { max_age?: number; max_uses?: number } = {}) {
    return this.post<Invite>(`/channels/${channelId}/invites`, body);
  }
  typing(channelId: string) {
    return this.post<void>(`/channels/${channelId}/typing`);
  }
  listForumPosts(channelId: string) {
    return this.get<Channel[]>(`/channels/${channelId}/threads`);
  }
  createThread(channelId: string, body: { name: string; message_id?: string; type?: number; auto_archive_duration?: number; applied_tags?: string[]; request_id?: string; message?: { content: string } }) {
    return this.post<Channel>(`/channels/${channelId}/threads`, body);
  }

  discoveryGuilds(query: DiscoveryQuery = {}) {
    return this.get<DiscoveryPage>('/discovery/guilds', query as Record<string, string>);
  }
  async discoveryCategories() {
    return (await this.get<{ categories: string[] }>('/discovery/categories')).categories;
  }
  joinDiscoveryGuild(guildId: string) {
    return this.post<void>(`/discovery/guilds/${guildId}/join`);
  }
  guildDiscovery(guildId: string) {
    return this.get<GuildDiscoverySettings>(`/guilds/${guildId}/discovery`);
  }
  putGuildDiscovery(guildId: string, body: { enabled: boolean; category?: string | null; tags?: string[] }) {
    return this.put<GuildDiscoverySettings>(`/guilds/${guildId}/discovery`, body);
  }

  invite(code: string) {
    return this.get<Invite>(`/invites/${enc(code)}`, { with_counts: 'true' } as Record<string, string>);
  }
  acceptInvite(code: string) {
    return this.post<Invite>(`/invites/${enc(code)}`);
  }
  memberVerification(guildId: string) {
    return this.get<{ enabled: boolean; rules: string[]; revision: number; pending: boolean }>(`/guilds/${enc(guildId)}/member-verification`);
  }
  setMemberVerification(guildId: string, body: { enabled: boolean; rules: string[] }) {
    return this.put<{ enabled: boolean; rules: string[]; revision: number; pending: boolean }>(`/guilds/${enc(guildId)}/member-verification`, body);
  }
  acceptMemberVerification(guildId: string, revision: number) {
    return this.post<void>(`/guilds/${enc(guildId)}/member-verification/accept`, { revision });
  }
  welcomeScreen(guildId: string) {
    return this.get<{ enabled: boolean; description: string; channels: { channel_id: string; description: string }[] }>(`/guilds/${enc(guildId)}/welcome-screen`);
  }
  setWelcomeScreen(guildId: string, body: { enabled: boolean; description: string; channels: { channel_id: string; description: string }[] }) {
    return this.put<{ enabled: boolean; description: string; channels: { channel_id: string; description: string }[] }>(`/guilds/${enc(guildId)}/welcome-screen`, body);
  }
  onboarding(guildId: string) { return this.get<OnboardingResponse>(`/guilds/${enc(guildId)}/onboarding`); }
  setOnboarding(guildId: string, body: OnboardingConfig) { return this.put<OnboardingResponse>(`/guilds/${enc(guildId)}/onboarding`, body); }
  completeOnboarding(guildId: string, revision: number, choices: number[]) { return this.post<{ channel_ids: string[] }>(`/guilds/${enc(guildId)}/onboarding/complete`, { revision, choices }); }
  deleteInvite(code: string) {
    return this.del<void>(`/invites/${enc(code)}`);
  }

  messages(channelId: string, query: MessageQuery = {}) {
    return this.get<Message[]>(`/channels/${channelId}/messages`, { ...query, limit: query.limit ?? 50 });
  }
  searchMessages(scope: { guildId?: string | null; channelId: string }, params: SearchParams) {
    const path = scope.guildId ? `/guilds/${scope.guildId}/messages/search` : `/channels/${scope.channelId}/messages/search`;
    return this.get<MessageSearchResponse>(path, toQuery(params));
  }
  createScheduledMessage(channelId: string, body: CreateScheduledMessage) {
    return this.post<ScheduledMessage>(`/channels/${enc(channelId)}/messages/scheduled`, body);
  }
  scheduledMessages(channelId: string, query?: { after?: string; limit?: number }) {
    return this.get<ScheduledMessagePage>(`/channels/${enc(channelId)}/messages/scheduled`, query);
  }
  scheduledMessage(channelId: string, scheduleId: string) {
    return this.get<ScheduledMessage>(`/channels/${enc(channelId)}/messages/scheduled/${enc(scheduleId)}`);
  }
  editScheduledMessage(channelId: string, scheduleId: string, body: EditScheduledMessage) {
    return this.patch<ScheduledMessage>(`/channels/${enc(channelId)}/messages/scheduled/${enc(scheduleId)}`, body);
  }
  cancelScheduledMessage(channelId: string, scheduleId: string, expectedRevision: number) {
    return this.http.request<ScheduledMessage>('DELETE', `/channels/${enc(channelId)}/messages/scheduled/${enc(scheduleId)}`, { query: { expected_revision: expectedRevision } });
  }
  sendMessage(channelId: string, body: CreateMessageBody) {
    return this.post<Message>(`/channels/${channelId}/messages`, body);
  }
  editMessage(channelId: string, messageId: string, patch: EditMessageBody) {
    return this.patch<Message>(`/channels/${channelId}/messages/${messageId}`, patch);
  }
  deleteMessage(channelId: string, messageId: string) {
    return this.del<void>(`/channels/${channelId}/messages/${messageId}`);
  }
  addReaction(channelId: string, messageId: string, emoji: string) {
    return this.put<void>(`/channels/${channelId}/messages/${messageId}/reactions/${enc(emoji)}/@me`);
  }
  removeReaction(channelId: string, messageId: string, emoji: string) {
    return this.del<void>(`/channels/${channelId}/messages/${messageId}/reactions/${enc(emoji)}/@me`);
  }
  reactionUsers(channelId: string, messageId: string, emoji: string) {
    return this.get<{ id: string; username?: string; global_name?: string | null; avatar?: string | null }[]>(`/channels/${channelId}/messages/${messageId}/reactions/${enc(emoji)}`);
  }
  removeEmojiReactions(channelId: string, messageId: string, emoji: string) {
    return this.del<void>(`/channels/${channelId}/messages/${messageId}/reactions/${enc(emoji)}`);
  }
  removeUserReaction(channelId: string, messageId: string, emoji: string, userId: string) {
    return this.del<void>(`/channels/${channelId}/messages/${messageId}/reactions/${enc(emoji)}/${userId}`);
  }
  removeAllReactions(channelId: string, messageId: string) {
    return this.del<void>(`/channels/${channelId}/messages/${messageId}/reactions`);
  }
  pins(channelId: string) {
    return this.get<Message[]>(`/channels/${channelId}/pins`);
  }
  pin(channelId: string, messageId: string) {
    return this.put<void>(`/channels/${channelId}/pins/${messageId}`);
  }
  unpin(channelId: string, messageId: string) {
    return this.del<void>(`/channels/${channelId}/pins/${messageId}`);
  }
  ack(channelId: string, messageId: string, options?: { manual?: boolean; mentionCount?: number }) {
    return this.post<void>(`/channels/${channelId}/messages/${messageId}/ack`, options?.manual ? { manual: true, mention_count: options.mentionCount ?? 0 } : undefined);
  }
  createAttachmentSlots(channelId: string, files: { filename: string; file_size: number }[]) {
    return this.post<{ attachments: AttachmentUploadSlot[] }>(`/channels/${channelId}/attachments`, {
      files: files.map((f, i) => ({ ...f, id: String(i) })),
    });
  }
  refreshAttachmentUrls(channelId: string, urls: string[]) {
    return this.post<{ refreshed_urls: { original: string; refreshed: string }[] }>(`/channels/${channelId}/attachments/refresh-urls`, { attachment_urls: urls });
  }
  upload(url: string, file: Blob, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) {
    return this.http.upload(url, file, onProgress, signal);
  }

  voiceRegions() {
    return this.get<VoiceRegion[]>('/voice/regions');
  }

  applications() {
    return this.get<ApplicationSummary[]>('/applications');
  }
  botAuthorizationInfo(request: BotAuthorizationRequest) {
    return this.get<BotAuthorizationInfo>('/oauth2/authorize', { ...request });
  }
  authorizeBot(request: BotAuthorizationRequest & { guild_id: string; installation_revision: string }) {
    return this.post<{ location: string }>('/oauth2/authorize', request);
  }
  applicationAuthorizations() {
    return this.get<ApplicationAuthorization[]>('/oauth2/tokens');
  }
  revokeApplicationAuthorization(authorizationId: string) {
    return this.del<void>(`/oauth2/tokens/${enc(authorizationId)}`);
  }
  guildIntegrations(guildId: string) {
    return this.get<GuildIntegration[]>(`/guilds/${enc(guildId)}/integrations`);
  }
  removeGuildIntegration(guildId: string, applicationId: string) {
    return this.del<void>(`/guilds/${enc(guildId)}/integrations/${enc(applicationId)}`);
  }
  guildWebhooks(guildId: string) {
    return this.get<Webhook[]>(`/guilds/${enc(guildId)}/webhooks`);
  }
  followAnnouncement(channelId: string, targetChannelId: string) {
    return this.post<{ channel_id: string; webhook_id: string }>(`/channels/${enc(channelId)}/followers`, { webhook_channel_id: targetChannelId });
  }
  publishAnnouncement(channelId: string, messageId: string) {
    return this.post<Message>(`/channels/${enc(channelId)}/messages/${enc(messageId)}/crosspost`);
  }
  followedChannels(guildId: string) {
    return this.get<{ channel_id: string; webhook_channel_id: string; webhook_id: string }[]>(`/guilds/${enc(guildId)}/followed-channels`);
  }
  createWebhook(channelId: string, body: { name: string; avatar?: string }) {
    return this.post<WebhookCredential>(`/channels/${enc(channelId)}/webhooks`, body);
  }
  updateWebhook(webhookId: string, body: WebhookEdit) {
    return this.patch<Webhook>(`/webhooks/${enc(webhookId)}`, body);
  }
  resetWebhookToken(webhookId: string) {
    return this.post<WebhookCredential>(`/webhooks/${enc(webhookId)}/reset-token`);
  }
  deleteWebhook(webhookId: string) {
    return this.del<void>(`/webhooks/${enc(webhookId)}`);
  }
  globalCommands(applicationId: string) {
    return this.get<ApplicationCommand[]>(`/applications/${applicationId}/commands`);
  }
  createApplication(body: { name: string; description?: string }) {
    return this.post<ApplicationSummary>('/applications', body);
  }
  resetBotToken(applicationId: string) {
    return this.post<{ token: string }>(`/applications/${enc(applicationId)}/bot/reset-token`);
  }
  createCommand(applicationId: string, body: { type: number; name: string; description: string }) {
    return this.post<ApplicationCommand>(`/applications/${enc(applicationId)}/commands`, body);
  }
  deleteCommand(applicationId: string, commandId: string) {
    return this.del<void>(`/applications/${enc(applicationId)}/commands/${enc(commandId)}`);
  }
  commandIndex(guildId: string) {
    return this.get<CommandIndex>(`/guilds/${guildId}/application-command-index`);
  }
  createInteraction(body: CreateInteractionBody) {
    return this.post<{ id: string }>('/interactions', body);
  }
}
