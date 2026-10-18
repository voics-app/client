/** Maps gateway DISPATCH events (P6/P7) onto the Zustand stores. */
import type {
  Channel,
  Emoji,
  GuildFull,
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
} from '@shared/contracts/rest';
import type { MessageAck, TypingStart, VoiceServerUpdate } from '@shared/contracts/gateway';
import { useGuildStore } from './stores/guildStore';
import { useInteractionStore } from './stores/interactionStore';
import { useMessageStore, type ChatMessage } from './stores/messageStore';
import { usePresenceStore, useReadStateStore, useRelationshipStore, useTypingStore } from './stores/peopleStores';
import { useSessionStore } from './stores/sessionStore';
import { useVoiceStore } from './stores/voiceStore';

export interface DispatchContext {
  onVoiceServerUpdate(update: VoiceServerUpdate): void;
  onIncomingMessage(message: ChatMessage): void;
  invalidate(queryKey: readonly unknown[]): void;
}

type Handler = (data: never) => void;

interface ReactionEvent {
  channel_id: string;
  message_id: string;
  user_id: string;
  emoji: Emoji;
}

const meId = () => useSessionStore.getState().user?.id ?? null;

function hydrateReady(ready: ReadyPayload): void {
  const session = useSessionStore.getState();
  session.setUser(ready.user);
  session.setSettings(ready.user_settings ?? {});
  useGuildStore.getState().hydrate(ready.guilds, ready.private_channels, ready.user_settings?.guild_positions);
  useRelationshipStore.getState().hydrate(ready.relationships ?? []);
  useReadStateStore.getState().hydrate(ready.read_state ?? []);
  const presences = [...(ready.presences ?? []), ...ready.guilds.flatMap((g) => g.presences ?? [])];
  usePresenceStore.getState().setMany(Object.fromEntries(presences.map((p) => [p.user.id, { status: p.status, activities: p.activities }])));
  for (const g of ready.guilds) useVoiceStore.getState().hydrate(g.id, g.voice_states ?? []);
  useSessionStore.setState({ sessionId: ready.session_id, status: 'ready' });
}

function receiveMessage(message: Message, ctx: DispatchContext): void {
  useMessageStore.getState().receive(message);
  if (message.interaction_metadata) useInteractionStore.getState().resolvePending(message.channel_id, message.interaction_metadata.id);
  const guilds = useGuildStore.getState();
  const channel = guilds.channels[message.channel_id];
  if (channel) guilds.upsertChannel({ ...channel, last_message_id: message.id });
  useTypingStore.getState().stop(message.channel_id, message.author.id);
  const me = meId();
  if (message.author.id === me) {
    useReadStateStore.getState().markRead(message.channel_id, message.id);
  } else if (me && (message.mentions.some((u) => u.id === me) || message.mention_everyone || !message.guild_id)) {
    useReadStateStore.getState().addMention(message.channel_id);
  }
  ctx.onIncomingMessage(message);
}

export function createDispatchRouter(ctx: DispatchContext): (event: string, data: unknown) => void {
  const guilds = () => useGuildStore.getState();
  const messages = () => useMessageStore.getState();

  const handlers: Record<string, Handler> = {
    READY: (d: ReadyPayload) => hydrateReady(d),
    RESUMED: () => useSessionStore.getState().setStatus('ready'),

    GUILD_CREATE: (d: GuildFull) => {
      guilds().upsertGuild(d);
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
    GUILD_MEMBER_ADD: (d: GuildMember & { guild_id: string }) => guilds().upsertMember(d.guild_id, d),
    GUILD_MEMBER_UPDATE: (d: GuildMember & { guild_id: string }) => {
      const existing = guilds().members[d.guild_id]?.[d.user.id];
      guilds().upsertMember(d.guild_id, { ...existing, ...d });
    },
    GUILD_MEMBER_REMOVE: (d: { guild_id: string; user: User }) => guilds().removeMember(d.guild_id, d.user.id),
    GUILD_MEMBERS_CHUNK: (d: { guild_id: string; members: GuildMember[]; presences?: PresenceUpdate[] }) => {
      guilds().upsertMembers(d.guild_id, d.members);
      if (d.presences) {
        usePresenceStore.getState().setMany(Object.fromEntries(d.presences.map((p) => [p.user.id, { status: p.status, activities: p.activities }])));
      }
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
    MESSAGE_ACK: (d: MessageAck) => useReadStateStore.getState().markRead(d.channel_id, d.message_id),
    TYPING_START: (d: TypingStart) => {
      if (d.user_id !== meId()) useTypingStore.getState().start(d.channel_id, d.user_id);
    },

    PRESENCE_UPDATE: (d: PresenceUpdate) => usePresenceStore.getState().set(d.user.id, { status: d.status, activities: d.activities }),
    USER_UPDATE: (d: User) => {
      if (d.id === meId()) useSessionStore.getState().setUser(d);
    },
    USER_SETTINGS_UPDATE: (d: Partial<UserSettings>) => useSessionStore.getState().setSettings(d),
    RELATIONSHIP_ADD: (d: Relationship) => useRelationshipStore.getState().upsert(d),
    RELATIONSHIP_REMOVE: (d: { id: string }) => useRelationshipStore.getState().remove(d.id),
    SESSIONS_REPLACE: () => undefined,

    VOICE_STATE_UPDATE: (d: VoiceState) => useVoiceStore.getState().upsertState(d),
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
