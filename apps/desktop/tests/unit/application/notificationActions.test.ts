import { beforeEach, describe, expect, it, vi } from 'vitest';
import { muteScope, setLevel, setToggles } from '@renderer/application/notificationActions';
import { useNotificationSettingsStore } from '@renderer/application/stores/notificationSettingsStore';
import { createDispatchRouter } from '@renderer/application/dispatchRouter';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { useMentionInboxStore } from '@renderer/application/stores/mentionInboxStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { effectiveLevelDeep, emptySettings, isChannelMutedDeep, activeOverrides, withMute } from '@discordy/core/domain/notificationSettings';
import { addInboxEntry, inboxEntryOf, type InboxEntry } from '@discordy/core/domain/mentionInbox';
import type { GuildNotificationSettings } from '@discordy/core/contracts/rest';

function api() {
  return {
    putUserNote: vi.fn(),
    updateGuildNotificationSettings: vi.fn(async (guildId: string | null, patch: Record<string, unknown>): Promise<GuildNotificationSettings> => ({ ...emptySettings(guildId), ...patch }) as GuildNotificationSettings),
  };
}

describe('synced mute and level commands', () => {
  beforeEach(() => useNotificationSettingsStore.getState().reset());

  it('mutes a channel for a duration and sends selected_time_window', async () => {
    const a = api();
    await muteScope(a, 'g', 'c', 3600, 0);
    expect(a.updateGuildNotificationSettings).toHaveBeenCalledWith('g', { channel_overrides: [{ channel_id: 'c', muted: true, mute_config: { selected_time_window: 3600 } }] });
  });

  it('mutes the server until turned off and unmutes it', async () => {
    const a = api();
    await muteScope(a, 'g', null, null);
    expect(a.updateGuildNotificationSettings).toHaveBeenLastCalledWith('g', { muted: true, mute_config: { selected_time_window: -1 } });
    await muteScope(a, 'g', null, undefined);
    expect(a.updateGuildNotificationSettings).toHaveBeenLastCalledWith('g', { muted: false, mute_config: null });
  });

  it('sets levels and toggles, rolling back when the API refuses', async () => {
    const a = api();
    await setLevel(a, 'g', null, 1);
    expect(useNotificationSettingsStore.getState().byScope.g!.message_notifications).toBe(1);
    await setToggles(a, 'g', { suppress_everyone: true });
    expect(useNotificationSettingsStore.getState().byScope.g!.suppress_everyone).toBe(true);
    a.updateGuildNotificationSettings.mockRejectedValueOnce(new Error('nope'));
    await expect(setLevel(a, 'g', 'c', 2)).rejects.toThrow('nope');
    expect(useNotificationSettingsStore.getState().byScope.g!.channel_overrides).toEqual([]);
  });
});

describe('category-aware rules', () => {
  it('a category level and mute apply to its channels; channel overrides win', () => {
    let s = emptySettings('g');
    s = { ...s, channel_overrides: [{ channel_id: 'cat', message_notifications: 2, muted: false, mute_config: null }, { channel_id: 'c2', message_notifications: 0, muted: false, mute_config: null }] };
    expect(effectiveLevelDeep(s, { id: 'c1', parent_id: 'cat' }, 0)).toBe(2);
    expect(effectiveLevelDeep(s, { id: 'c2', parent_id: 'cat' }, 1)).toBe(0);
    expect(effectiveLevelDeep(s, { id: 'c3' }, 1)).toBe(1);
    const m = withMute(s, 'cat', null, 0);
    expect(isChannelMutedDeep(m, { id: 'c1', parent_id: 'cat' }, 1)).toBe(true);
    expect(activeOverrides(m, 1).map((o) => o.channel_id).sort()).toEqual(['c2', 'cat']);
  });
});

describe('mentions inbox', () => {
  const msg = {
    id: '30',
    channel_id: 'c',
    guild_id: 'g',
    content: 'hey **you**',
    timestamp: '2026-10-20T10:00:00Z',
    author: { id: 'bob', username: 'bob', global_name: 'Bob' },
    mentions: [{ id: 'me' }],
    mention_roles: [] as string[],
    mention_everyone: false,
  };
  const ctx = { meId: 'me', myRoleIds: [] as string[] };

  it('creates entries for server mentions only', () => {
    expect(inboxEntryOf(msg, ctx)).toMatchObject({ id: '30', guildId: 'g', authorName: 'Bob', preview: 'hey you' });
    expect(inboxEntryOf({ ...msg, guild_id: null }, ctx)).toBeNull();
    expect(inboxEntryOf({ ...msg, mentions: [] }, ctx)).toBeNull();
    expect(inboxEntryOf({ ...msg, author: { id: 'me', username: 'me' } }, ctx)).toBeNull();
    expect(inboxEntryOf({ ...msg, mentions: [], mention_everyone: true }, { ...ctx, suppressEveryone: true })).toBeNull();
  });

  it('keeps newest first without duplicates', () => {
    const e = (id: string): InboxEntry => ({ id, channelId: 'c', guildId: 'g', authorId: 'b', authorName: 'b', preview: id, timestamp: '' });
    let list = addInboxEntry([], e('10'));
    list = addInboxEntry(list, e('30'));
    list = addInboxEntry(list, e('10'));
    expect(list.map((x) => x.id)).toEqual(['30', '10']);
  });

  it('a live mention feeds the inbox unless the channel is muted for the badge', () => {
    useMentionInboxStore.getState().clear();
    useReadStateStore.getState().reset();
    useNotificationSettingsStore.getState().reset();
    useSessionStore.setState({ user: { id: 'me', username: 'me', global_name: null, avatar: null } } as never);
    useGuildStore.setState({ channels: { c: { id: 'c', guild_id: 'g', type: 0 } } as never, members: {} as never });
    const route = createDispatchRouter({ onVoiceServerUpdate: vi.fn(), onIncomingMessage: vi.fn(), invalidate: vi.fn() });
    const full = { ...msg, id: '31', attachments: [], embeds: [], pinned: false, type: 0, edited_timestamp: null };
    route('MESSAGE_CREATE', full);
    expect(useMentionInboxStore.getState().entries).toHaveLength(1);
    expect(useReadStateStore.getState().byChannel.c?.mentionCount).toBe(1);
    useNotificationSettingsStore.getState().upsert(withMute(emptySettings('g'), null, null, 0));
    route('MESSAGE_CREATE', { ...full, id: '32' });
    expect(useReadStateStore.getState().byChannel.c?.mentionCount).toBe(1);
  });

  it('MESSAGE_ACK with a mention count sets the marker exactly, even backwards', () => {
    useReadStateStore.getState().reset();
    useReadStateStore.getState().markRead('c', '500');
    const route = createDispatchRouter({ onVoiceServerUpdate: vi.fn(), onIncomingMessage: vi.fn(), invalidate: vi.fn() });
    route('MESSAGE_ACK', { channel_id: 'c', message_id: '300', mention_count: 1 });
    expect(useReadStateStore.getState().byChannel.c).toEqual({ lastReadId: '300', mentionCount: 1 });
  });
});
