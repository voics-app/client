import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispatchRouter } from '@renderer/application/dispatchRouter';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMessageStore } from '@renderer/application/stores/messageStore';
import { usePresenceStore, useReadStateStore, useRelationshipStore, useTypingStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import type { GuildFull, Message } from '@shared/contracts';

const me = { id: '1', username: 'me', global_name: 'Me', avatar: null };
const friend = { id: '2', username: 'friend', global_name: 'Friend', avatar: null };

const guild: GuildFull = {
  id: '100',
  name: 'Guild',
  icon: null,
  owner_id: '1',
  roles: [{ id: '100', name: '@everyone', color: 0, hoist: false, position: 0, permissions: '3072', managed: false, mentionable: false }],
  emojis: [],
  channels: [{ id: '200', type: 0, guild_id: '100', name: 'general', delivery_mode: 'standard', last_message_id: null }],
  members: [{ user: me, roles: [], joined_at: '2026-01-01', deaf: false, mute: false }],
  voice_states: [],
  presences: [{ user: { id: '2' }, status: 'online', activities: [] }],
};

const message = (id: string, extra: Partial<Message> = {}): Message => ({
  id,
  channel_id: '200',
  guild_id: '100',
  author: friend,
  content: 'hello',
  timestamp: '2026-10-16T10:00:00.000Z',
  edited_timestamp: null,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
  ...extra,
});

function setup() {
  const ctx = { onVoiceServerUpdate: vi.fn(), onIncomingMessage: vi.fn(), invalidate: vi.fn() };
  const route = createDispatchRouter(ctx);
  route('READY', {
    v: 1,
    user: me,
    session_id: 's',
    guilds: [guild],
    private_channels: [{ id: '300', type: 1, recipients: [friend], delivery_mode: 'p2p', last_message_id: null }],
    relationships: [{ id: '2', type: 1, user: friend }],
    user_settings: { default_delivery_mode: 'ephemeral' },
    read_state: [{ id: '200', last_message_id: null, mention_count: 0 }],
  });
  return { route, ctx };
}

describe('dispatchRouter', () => {
  beforeEach(() => {
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    useReadStateStore.getState().reset();
    usePresenceStore.getState().reset();
    useVoiceStore.getState().resetCall();
  });

  it('accepts unavailable guild placeholders in READY and fills them from GUILD_CREATE', () => {
    const route = createDispatchRouter({ onVoiceServerUpdate: vi.fn(), onIncomingMessage: vi.fn(), invalidate: vi.fn() });
    route('READY', {
      v: 1,
      user: me,
      session_id: 's',
      guilds: [{ id: '100', unavailable: true }],
      private_channels: [],
      relationships: [],
      user_settings: {},
    });
    expect(useSessionStore.getState().status).toBe('ready');
    expect(useGuildStore.getState().guilds['100']).toBeUndefined();

    route('GUILD_CREATE', guild);
    expect(useGuildStore.getState().order).toEqual(['100']);
    expect(useGuildStore.getState().channels['200']?.name).toBe('general');
    // Presence snapshot of the standalone GUILD_CREATE feeds the member list (client#135).
    expect(usePresenceStore.getState().byUser['2']?.status).toBe('online');
  });

  it('hydrates every store from READY', () => {
    setup();
    expect(useSessionStore.getState().user?.id).toBe('1');
    expect(useSessionStore.getState().settings.default_delivery_mode).toBe('ephemeral');
    expect(useGuildStore.getState().order).toEqual(['100']);
    expect(useGuildStore.getState().channels['200']?.name).toBe('general');
    expect(useGuildStore.getState().channels['300']?.delivery_mode).toBe('p2p');
    expect(useRelationshipStore.getState().byUser['2']?.type).toBe(1);
    expect(usePresenceStore.getState().byUser['2']?.status).toBe('online');
    expect(useSessionStore.getState().status).toBe('ready');
  });

  it('applies synced server folders from USER_SETTINGS_UPDATE', () => {
    const { route } = setup();
    route('USER_SETTINGS_UPDATE', { guild_folders: [{ id: 5, name: 'Work', color: 0xff0000, guild_ids: ['100'] }] });
    expect(useGuildStore.getState().rail[0]).toMatchObject({ id: 5, name: 'Work' });
  });

  it('appends MESSAGE_CREATE, resolves optimistic nonces and bumps last_message_id', () => {
    const { route, ctx } = setup();
    useMessageStore.getState().addOptimistic(message('nonce-1', { author: me, nonce: 'nonce-1' }));
    route('MESSAGE_CREATE', message('500', { author: me, nonce: 'nonce-1' }));
    const t = useMessageStore.getState().timelines['200']!;
    expect(t.ids).toEqual(['500']);
    expect(useGuildStore.getState().channels['200']?.last_message_id).toBe('500');
    expect(ctx.onIncomingMessage).toHaveBeenCalled();
  });

  it('counts mentions of me and marks my own messages as read', () => {
    const { route } = setup();
    route('MESSAGE_CREATE', message('501', { mentions: [me] }));
    expect(useReadStateStore.getState().byChannel['200']?.mentionCount).toBe(1);
    route('MESSAGE_CREATE', message('502', { author: me }));
    expect(useReadStateStore.getState().byChannel['200']).toEqual({ lastReadId: '502', mentionCount: 0 });
  });

  it('adds no mention badge for a silent message or a reply with the ping off', () => {
    const { route } = setup();
    route('MESSAGE_CREATE', message('504', { mentions: [me], flags: 1 << 12 }));
    expect(useReadStateStore.getState().byChannel['200']?.mentionCount ?? 0).toBe(0);
    route('MESSAGE_CREATE', message('505', { type: 19, mentions: [] }));
    expect(useReadStateStore.getState().byChannel['200']?.mentionCount ?? 0).toBe(0);
  });

  it('clears typing when the author sends', () => {
    const { route } = setup();
    route('TYPING_START', { channel_id: '200', user_id: '2', timestamp: Date.now() / 1000 });
    expect(Object.keys(useTypingStore.getState().byChannel['200'] ?? {})).toEqual(['2']);
    route('MESSAGE_CREATE', message('503'));
    expect(useTypingStore.getState().byChannel['200']?.['2']).toBeUndefined();
  });

  it('applies updates, deletes and reactions', () => {
    const { route } = setup();
    route('MESSAGE_CREATE', message('600'));
    route('MESSAGE_UPDATE', { id: '600', channel_id: '200', content: 'edited', edited_timestamp: '2026-10-16T11:00:00Z' });
    expect(useMessageStore.getState().timelines['200']!.byId['600']!.content).toBe('edited');
    route('MESSAGE_REACTION_ADD', { channel_id: '200', message_id: '600', user_id: '1', emoji: { id: null, name: '🔥' } });
    route('MESSAGE_REACTION_ADD', { channel_id: '200', message_id: '600', user_id: '2', emoji: { id: null, name: '🔥' } });
    expect(useMessageStore.getState().timelines['200']!.byId['600']!.reactions).toEqual([{ emoji: { id: null, name: '🔥' }, count: 2, me: true }]);
    route('MESSAGE_REACTION_REMOVE', { channel_id: '200', message_id: '600', user_id: '1', emoji: { id: null, name: '🔥' } });
    expect(useMessageStore.getState().timelines['200']!.byId['600']!.reactions).toEqual([{ emoji: { id: null, name: '🔥' }, count: 1, me: false }]);
    route('MESSAGE_DELETE', { id: '600', channel_id: '200' });
    expect(useMessageStore.getState().timelines['200']!.ids).toEqual([]);
  });

  it('tracks guild structure events', () => {
    const { route } = setup();
    route('CHANNEL_CREATE', { id: '201', type: 2, guild_id: '100', name: 'Voice', delivery_mode: 'standard' });
    route('GUILD_ROLE_CREATE', { guild_id: '100', role: { id: '101', name: 'Mods', color: 0, hoist: true, position: 1, permissions: '0', managed: false, mentionable: true } });
    route('GUILD_MEMBER_ADD', { guild_id: '100', user: friend, roles: ['101'], joined_at: 'x', deaf: false, mute: false });
    expect(useGuildStore.getState().channels['201']?.type).toBe(2);
    expect(useGuildStore.getState().guilds['100']?.roles).toHaveLength(2);
    expect(useGuildStore.getState().members['100']?.['2']?.roles).toEqual(['101']);
    route('GUILD_MEMBER_REMOVE', { guild_id: '100', user: friend });
    expect(useGuildStore.getState().members['100']?.['2']).toBeUndefined();
    route('GUILD_DELETE', { id: '100' });
    expect(useGuildStore.getState().order).toEqual([]);
  });

  it('records voice states and forwards VOICE_SERVER_UPDATE', () => {
    const { route, ctx } = setup();
    route('VOICE_STATE_UPDATE', { guild_id: '100', channel_id: '201', user_id: '2', session_id: 'x', deaf: false, mute: false, self_deaf: false, self_mute: true, self_video: false, suppress: false });
    expect(useVoiceStore.getState().states['100']?.['2']?.self_mute).toBe(true);
    route('VOICE_STATE_UPDATE', { guild_id: '100', channel_id: null, user_id: '2', session_id: 'x', deaf: false, mute: false, self_deaf: false, self_mute: true, self_video: false, suppress: false });
    expect(useVoiceStore.getState().states['100']?.['2']).toBeUndefined();
    const update = { token: 't', guild_id: '100', channel_id: '201', endpoint: 'wss://rtc', region: 'nl-home' };
    route('VOICE_SERVER_UPDATE', update);
    expect(ctx.onVoiceServerUpdate).toHaveBeenCalledWith(update);
  });

  it('tells the call about every voice state after storing it', () => {
    const onVoiceState = vi.fn();
    const route = createDispatchRouter({ onVoiceServerUpdate: vi.fn(), onVoiceState, onIncomingMessage: vi.fn(), invalidate: vi.fn() });
    const state = { guild_id: '100', channel_id: null, user_id: '1', session_id: 'x', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false };
    route('VOICE_STATE_UPDATE', state);
    expect(onVoiceState).toHaveBeenCalledWith(state);
  });

  it('handles relationships and presence', () => {
    const { route } = setup();
    route('PRESENCE_UPDATE', { user: { id: '2' }, status: 'dnd', activities: [] });
    expect(usePresenceStore.getState().byUser['2']?.status).toBe('dnd');
    route('RELATIONSHIP_REMOVE', { id: '2', type: 1 });
    expect(useRelationshipStore.getState().byUser['2']).toBeUndefined();
  });

  it('replaces a pending request with the friend entry on accept, for both sides', () => {
    const { route } = setup();
    route('RELATIONSHIP_ADD', { id: '2', type: 3, user: friend });
    expect(useRelationshipStore.getState().byUser['2']?.type).toBe(3);
    route('RELATIONSHIP_ADD', { id: '2', type: 1, user: friend });
    expect(useRelationshipStore.getState().byUser['2']).toEqual({ id: '2', type: 1, user: friend });
  });

  it('invalidates cached queries for bans and audit logs', () => {
    const { route, ctx } = setup();
    route('GUILD_BAN_ADD', { guild_id: '100', user: friend });
    expect(ctx.invalidate).toHaveBeenCalledWith(['guild', '100', 'bans']);
  });

  it('ignores unknown events', () => {
    const { route } = setup();
    expect(() => route('SOMETHING_NEW', {})).not.toThrow();
  });
});
