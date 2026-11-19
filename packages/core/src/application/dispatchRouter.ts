/** Maps gateway DISPATCH events (P6/P7) onto the Zustand stores. */
import { becameFriends } from '@discordy/core/domain/dmIntro';
import type { GuildScheduledEventStart } from '@discordy/core/contracts/scheduledEvents';
import { inboxEntryOf } from '@discordy/core/domain/mentionInbox';
import { isMentioned } from '@discordy/core/domain/notificationPolicy';
import { isChannelMutedDeep, scopeKey } from '@discordy/core/domain/notificationSettings';
import type {
  Channel,
  Emoji,
  GuildFull,
  GuildNotificationSettings,
  GuildMember,
  Message,
  ModalCreate,
  PresenceUpdate,
  ReadyPayload,
  Relationship,
  Role,
  User,
  UserSettings,
  VoiceState,
} from '@discordy/core/contracts/rest';
import { RelationshipType } from '@discordy/core/contracts/rest';
import type { CallDeleteEvent, CallEvent, MessageAck, ReadStateSync, ReadStateUpdate, TypingStart, VoiceServerUpdate } from '@discordy/core/contracts/gateway';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import { useMentionInboxStore } from '@discordy/core/application/stores/mentionInboxStore';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useNotificationSettingsStore, useUserNotesStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { usePresenceStore, useReadStateStore, useRelationshipStore, useTypingStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from './stores/voiceStore';
import { readAloudIfWanted } from './ttsReader';

export interface DispatchContext {
  onVoiceServerUpdate(update: VoiceServerUpdate): void;
  /** Every VOICE_STATE_UPDATE, after the store has applied it (the call reacts to its own). */
  onVoiceState?(state: VoiceState): void;
  onIncomingMessage(message: ChatMessage): void;
  onScheduledEventStart?(event: GuildScheduledEventStart): void;
  /** A friend request from someone else arrived (not a replay of one already pending). */
  onFriendRequest?(request: Relationship): void;
  invalidate(queryKey: readonly unknown[]): void;
  /** The account settings arrived (READY) or changed (USER_SETTINGS_UPDATE). */
  onUserSettings?(settings: Partial<UserSettings>, ready: boolean, userId?: string): void;
  /** A friend request became a friendship (accepted by either side): the DM with this user should exist. */
  onFriendship?(userId: string): void;
}

type Handler = (data: never) => void;

interface ReactionEvent {
  channel_id: string;
  message_id: string;
  user_id: string;
  emoji: Emoji;
}

const meId = () => useSessionStore.getState().user?.id ?? null;

function viewerRoleIds(guildId: string | null | undefined, me: string): readonly string[] {
  return (guildId ? useGuildStore.getState().members[guildId]?.[me]?.roles : undefined) ?? [];
}

/** READY lists guilds as `{id, unavailable: true}` placeholders (as Discord does); the full guild
 * follows in its own GUILD_CREATE. Only complete guilds are hydrated here. */
function isFullGuild(guild: GuildFull | { id: string; unavailable?: boolean }): guild is GuildFull {
  return Array.isArray((guild as GuildFull).channels);
}

function applyPresences(presences: PresenceUpdate[] | undefined): void {
  if (!presences?.length) return;
  usePresenceStore.getState().setMany(Object.fromEntries(presences.map((p) => [p.user.id, { status: p.status, activities: p.activities }])));
}

function hydrateReady(ready: ReadyPayload): void {
  const session = useSessionStore.getState();
  session.setUser(ready.user);
  session.setSettings(ready.user_settings ?? {});
  const guilds = (ready.guilds as Array<GuildFull | { id: string; unavailable?: boolean }>).filter(isFullGuild);
  useGuildStore.getState().hydrate(guilds, ready.private_channels, ready.user_settings?.guild_positions, ready.user_settings?.guild_folders);
  useRelationshipStore.getState().hydrate(ready.relationships ?? []);
  useNotificationSettingsStore.getState().hydrate(ready.user_guild_settings ?? []);
  useUserNotesStore.getState().hydrate(ready.notes ?? {});
  useReadStateStore.getState().hydrate(ready.read_state ?? [], { versioned: ready.read_state_versioned === true });
  applyPresences([...(ready.presences ?? []), ...guilds.flatMap((g) => g.presences ?? [])]);
  for (const g of guilds) useVoiceStore.getState().hydrate(g.id, g.voice_states ?? []);
  useSessionStore.setState({ sessionId: ready.session_id, status: 'ready' });
}

/** Unread/mention/inbox bookkeeping and notification for a message already in the store. Shared by
 * gateway MESSAGE_CREATE and the private (ephemeral/P2P) paths, which only have plaintext after decrypting. */
export function registerIncoming(message: ChatMessage, notify: (message: ChatMessage) => void): void {
  const me = meId();
  const localCounts = !useReadStateStore.getState().versioned || (message.deliveryMode !== undefined && message.deliveryMode !== 'standard');
  if (message.author.id === me) {
    if (localCounts) useReadStateStore.getState().markRead(message.channel_id, message.id);
  } else if (me) {
    const settings = useNotificationSettingsStore.getState().byScope[scopeKey(message.guild_id)];
    const channel = useGuildStore.getState().channels[message.channel_id];
    const ctx = { meId: me, myRoleIds: viewerRoleIds(message.guild_id, me), suppressEveryone: settings?.suppress_everyone, suppressRoles: settings?.suppress_roles };
    if (localCounts && isMentioned(message, ctx) && !isChannelMutedDeep(settings, { id: message.channel_id, parent_id: channel?.parent_id }, Date.now())) {
      useReadStateStore.getState().addMention(message.channel_id);
    }
    const entry = inboxEntryOf(message, ctx);
    if (entry) useMentionInboxStore.getState().add(entry);
  }
  readAloudIfWanted(message, me ?? undefined);
  notify(message);
}

function privateReadState(channelId: string): boolean {
  const mode = useGuildStore.getState().channels[channelId]?.delivery_mode;
  return mode !== undefined && mode !== 'standard';
}

function receiveMessage(message: Message, ctx: DispatchContext): void {
  useMessageStore.getState().receive(message);
  if (message.interaction_metadata) useInteractionStore.getState().resolvePending(message.channel_id, message.interaction_metadata.id);
  const guilds = useGuildStore.getState();
  const channel = guilds.channels[message.channel_id];
  if (channel) guilds.upsertChannel({ ...channel, last_message_id: message.id });
  useTypingStore.getState().stop(message.channel_id, message.author.id);
  registerIncoming(message, ctx.onIncomingMessage);
}

export function createDispatchRouter(ctx: DispatchContext): (event: string, data: unknown) => void {
  const guilds = () => useGuildStore.getState();
  const messages = () => useMessageStore.getState();

  const handlers: Record<string, Handler> = {
    GUILD_SCHEDULED_EVENT_CREATE: (d: { guild_id: string }) => ctx.invalidate(['guild-events', d.guild_id]),
    GUILD_SCHEDULED_EVENT_UPDATE: (d: { guild_id: string }) => ctx.invalidate(['guild-events', d.guild_id]),
    GUILD_SCHEDULED_EVENT_DELETE: (d: { guild_id: string }) => ctx.invalidate(['guild-events', d.guild_id]),
    GUILD_SCHEDULED_EVENT_USER_ADD: (d: { guild_id: string; guild_scheduled_event_id: string }) => { ctx.invalidate(['guild-events', d.guild_id]); ctx.invalidate(['event-interest', d.guild_id, d.guild_scheduled_event_id]); },
    GUILD_SCHEDULED_EVENT_USER_REMOVE: (d: { guild_id: string; guild_scheduled_event_id: string }) => { ctx.invalidate(['guild-events', d.guild_id]); ctx.invalidate(['event-interest', d.guild_id, d.guild_scheduled_event_id]); },
    GUILD_SCHEDULED_EVENT_START: (d: GuildScheduledEventStart) => ctx.onScheduledEventStart?.(d),
    READY: (d: ReadyPayload) => {
      hydrateReady(d);
      ctx.onUserSettings?.(d.user_settings ?? {}, true, d.user.id);
    },
    RESUMED: () => useSessionStore.getState().setStatus('ready'),

    GUILD_CREATE: (d: GuildFull) => {
      guilds().upsertGuild(d);
      // Guilds arrive in their own GUILD_CREATE after READY, carrying who is online right now.
      applyPresences(d.presences);
      useVoiceStore.getState().hydrate(d.id, d.voice_states ?? []);
    },
    GUILD_UPDATE: (d: GuildFull) => guilds().patchGuild(d),
    GUILD_DELETE: (d: { id: string }) => guilds().removeGuild(d.id),
    CHANNEL_CREATE: (d: Channel) => guilds().upsertChannel(d),
    CHANNEL_UPDATE: (d: Channel) => guilds().upsertChannel(d),
    CHANNEL_DELETE: (d: Channel) => guilds().removeChannel(d.id),
    THREAD_CREATE: (d: Channel) => guilds().upsertChannel(d),
    THREAD_UPDATE: (d: Channel) => guilds().upsertChannel(d),
    THREAD_DELETE: (d: Channel) => guilds().removeChannel(d.id),
    CHANNEL_RECIPIENT_ADD: (d: { channel_id: string; user: User }) => {
      const c = guilds().channels[d.channel_id];
      if (c) guilds().upsertChannel({ ...c, recipients: [...(c.recipients ?? []).filter((u) => u.id !== d.user.id), d.user] });
    },
    CHANNEL_RECIPIENT_REMOVE: (d: { channel_id: string; user: User }) => {
      const c = guilds().channels[d.channel_id];
      if (c) guilds().upsertChannel({ ...c, recipients: (c.recipients ?? []).filter((u) => u.id !== d.user.id) });
    },
    CHANNEL_PINS_UPDATE: (d: { channel_id: string; last_pin_timestamp?: string | null }) => {
      const c = guilds().channels[d.channel_id];
      if (c) guilds().upsertChannel({ ...c, last_pin_timestamp: d.last_pin_timestamp ?? null });
      ctx.invalidate(['channel', d.channel_id, 'pins']);
    },

    GUILD_ROLE_CREATE: (d: { guild_id: string; role: Role }) => guilds().upsertRole(d.guild_id, d.role),
    GUILD_ROLE_UPDATE: (d: { guild_id: string; role: Role }) => guilds().upsertRole(d.guild_id, d.role),
    GUILD_ROLE_DELETE: (d: { guild_id: string; role_id: string }) => guilds().removeRole(d.guild_id, d.role_id),
    GUILD_MEMBER_ADD: (d: GuildMember & { guild_id: string }) => {
      guilds().upsertMember(d.guild_id, d);
      if (d.user.bot) useInteractionStore.getState().invalidateCommands(d.guild_id);
    },
    GUILD_MEMBER_UPDATE: (d: GuildMember & { guild_id: string }) => {
      const existing = guilds().members[d.guild_id]?.[d.user.id];
      guilds().upsertMember(d.guild_id, { ...existing, ...d });
    },
    GUILD_MEMBER_REMOVE: (d: { guild_id: string; user: User }) => {
      guilds().removeMember(d.guild_id, d.user.id);
      if (d.user.bot) useInteractionStore.getState().invalidateCommands(d.guild_id);
    },
    APPLICATION_COMMAND_PERMISSIONS_UPDATE: (d: { guild_id: string }) => useInteractionStore.getState().invalidateCommands(d.guild_id),
    GUILD_MEMBERS_CHUNK: (d: { guild_id: string; members: GuildMember[]; presences?: PresenceUpdate[] }) => {
      guilds().upsertMembers(d.guild_id, d.members);
      applyPresences(d.presences);
    },
    GUILD_BAN_ADD: (d: { guild_id: string; user?: User }) => {
      if (d.user) guilds().removeMember(d.guild_id, d.user.id);
      ctx.invalidate(['guild', d.guild_id, 'bans']);
    },
    GUILD_BAN_REMOVE: (d: { guild_id: string }) => ctx.invalidate(['guild', d.guild_id, 'bans']),
    GUILD_EMOJIS_UPDATE: (d: { guild_id: string; emojis: Emoji[] }) => guilds().setEmojis(d.guild_id, d.emojis),
    INVITE_CREATE: (d: { guild_id?: string }) => d.guild_id && ctx.invalidate(['guild', d.guild_id, 'invites']),
    INVITE_DELETE: (d: { guild_id?: string }) => d.guild_id && ctx.invalidate(['guild', d.guild_id, 'invites']),
    AUDIT_LOG_ENTRY_CREATE: (d: { guild_id: string }) => ctx.invalidate(['guild', d.guild_id, 'audit']),

    MESSAGE_CREATE: (d: Message) => receiveMessage(d, ctx),
    MESSAGE_UPDATE: (d: Partial<Message> & { id: string; channel_id: string }) => messages().patch(d.channel_id, d.id, d),
    MESSAGE_DELETE: (d: { id: string; channel_id: string }) => messages().remove(d.channel_id, d.id),
    MESSAGE_DELETE_BULK: (d: { ids: string[]; channel_id: string }) => messages().removeMany(d.channel_id, d.ids),
    MESSAGE_REACTION_ADD: (d: ReactionEvent) => messages().reactionAdd(d.channel_id, d.message_id, d.emoji, d.user_id === meId()),
    MESSAGE_REACTION_REMOVE: (d: ReactionEvent) => messages().reactionRemove(d.channel_id, d.message_id, d.emoji, d.user_id === meId()),
    MESSAGE_REACTION_REMOVE_ALL: (d: { channel_id: string; message_id: string }) => messages().reactionClear(d.channel_id, d.message_id),
    MESSAGE_ACK: (d: MessageAck) => {
      if (useReadStateStore.getState().versioned && !privateReadState(d.channel_id)) {
        if (d.mention_count !== undefined) {
          useReadStateStore.getState().applySnapshot({ id: d.channel_id, last_message_id: d.message_id, mention_count: d.mention_count, read_state_version: d.read_state_version });
        }
        return;
      }
      // Private ACKs still carry the user's explicit cross-device read intent.
      // Only Standard snapshots own server-computed counts; legacy/private ACK
      // retains its existing marker and manual-unread semantics.
      if (d.mention_count !== undefined) useReadStateStore.getState().setPosition(d.channel_id, d.message_id, d.mention_count);
      else useReadStateStore.getState().markRead(d.channel_id, d.message_id);
    },
    READ_STATE_UPDATE: (d: ReadStateUpdate) => {
      if (!privateReadState(d.channel_id)) useReadStateStore.getState().applySnapshot({ ...d, id: d.channel_id });
    },
    READ_STATE_SYNC: (d: ReadStateSync) => {
      if (d.read_state_versioned === true && Array.isArray(d.read_state)) {
        useReadStateStore.getState().syncSnapshots(d.read_state.filter((entry) => !privateReadState(entry.id)));
      }
    },
    TYPING_START: (d: TypingStart) => {
      if (d.user_id !== meId()) useTypingStore.getState().start(d.channel_id, d.user_id);
    },

    PRESENCE_UPDATE: (d: PresenceUpdate) => usePresenceStore.getState().set(d.user.id, { status: d.status, activities: d.activities }),
    USER_UPDATE: (d: User) => {
      if (d.id === meId()) useSessionStore.getState().setUser(d);
    },
    USER_SETTINGS_UPDATE: (d: Partial<UserSettings>) => {
      useSessionStore.getState().setSettings(d);
      if (d.guild_folders) guilds().setRail(d.guild_folders);
      ctx.onUserSettings?.(d, false);
    },
    USER_GUILD_SETTINGS_UPDATE: (d: GuildNotificationSettings) => useNotificationSettingsStore.getState().upsert(d),
    USER_NOTE_UPDATE: (d: { id: string; note: string }) => useUserNotesStore.getState().set(d.id, d.note),
    RELATIONSHIP_ADD: (d: Relationship) => {
      const store = useRelationshipStore.getState();
      const known = store.byUser[d.id];
      const friends = becameFriends(known, d);
      store.upsert(d);
      if (friends) ctx.onFriendship?.(d.id);
      if (d.type === RelationshipType.INCOMING && known?.type !== RelationshipType.INCOMING) ctx.onFriendRequest?.(d);
    },
    RELATIONSHIP_REMOVE: (d: { id: string }) => useRelationshipStore.getState().remove(d.id),
    SESSIONS_REPLACE: () => undefined,

    VOICE_STATE_UPDATE: (d: VoiceState) => {
      useVoiceStore.getState().upsertState(d);
      ctx.onVoiceState?.(d);
    },
    CALL_CREATE: (d: CallEvent) => useCallStore.getState().upsert(d),
    CALL_UPDATE: (d: CallEvent) => useCallStore.getState().upsert(d),
    CALL_DELETE: (d: CallDeleteEvent) => useCallStore.getState().remove(d.channel_id),
    INTERACTION_MODAL_CREATE: (d: ModalCreate) => {
      const store = useInteractionStore.getState();
      const applicationId = store.applicationOf[d.interaction_id];
      if (!applicationId) return;
      store.resolvePending(d.channel_id, d.interaction_id);
      store.openModal({
        interactionId: d.interaction_id,
        applicationId,
        channelId: d.channel_id,
        customId: d.data.custom_id,
        title: d.data.title,
        components: d.data.components,
      });
    },
    VOICE_SERVER_UPDATE: (d: VoiceServerUpdate) => ctx.onVoiceServerUpdate(d),
  };

  return (event, data) => {
    const handler = handlers[event];
    if (!handler) return;
    try {
      handler(data as never);
    } catch (error) {
      console.error(`dispatch ${event} failed`, error);
    }
  };
}
