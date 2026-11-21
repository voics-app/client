import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIncoming } from '@discordy/core/application/dispatchRouter';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { emptySettings, withLevel } from '@discordy/core/domain/notificationSettings';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';

beforeEach(() => {
  useGuildStore.getState().reset();
  useReadStateStore.getState().reset();
  useNotificationSettingsStore.getState().reset();
  useSessionStore.setState({ user: { id: '1', username: 'me', global_name: null, avatar: null }, settings: { status: 'dnd', default_delivery_mode: 'standard' } });
  useGuildStore.getState().upsertChannel({ id: '200', type: 0, guild_id: '100', parent_id: 'category', delivery_mode: 'ephemeral' });
});

const message = (deliveryMode: 'ephemeral' | 'p2p'): ChatMessage => ({
  id: '500', channel_id: '200', guild_id: '100', deliveryMode,
  author: { id: '2', username: 'friend', global_name: null, avatar: null }, content: 'hello',
  timestamp: '2026-11-18T00:00:00Z', edited_timestamp: null, mention_everyone: false,
  mentions: [{ id: '1', username: 'me', global_name: null, avatar: null }], mention_roles: [],
  attachments: [], embeds: [], pinned: false, type: 0,
});

describe.each(['ephemeral', 'p2p'] as const)('%s local mention counts', (mode) => {
  it.each([null, 'category', '200'])('honors Nothing at scope %s', (scope) => {
    useNotificationSettingsStore.getState().upsert(withLevel(emptySettings('100'), scope, 2));
    registerIncoming(message(mode), vi.fn());
    expect(useReadStateStore.getState().byChannel['200']?.mentionCount ?? 0).toBe(0);
  });

  it('counts private mentions locally even with versioned server read state', () => {
    useReadStateStore.setState({ versioned: true });
    registerIncoming(message(mode), vi.fn());
    expect(useReadStateStore.getState().byChannel['200']?.mentionCount).toBe(1);
  });

  it('allows an explicit channel override and still counts during DND', () => {
    useNotificationSettingsStore.getState().upsert(withLevel(withLevel(emptySettings('100'), null, 2), '200', 1));
    registerIncoming(message(mode), vi.fn());
    expect(useReadStateStore.getState().byChannel['200']?.mentionCount).toBe(1);
  });
});
