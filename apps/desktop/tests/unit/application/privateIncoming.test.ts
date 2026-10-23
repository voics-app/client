import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIncoming } from '@renderer/application/dispatchRouter';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMentionInboxStore } from '@renderer/application/stores/mentionInboxStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import type { ChatMessage } from '@renderer/application/stores/messageStore';

const me = { id: '1', username: 'me', global_name: 'Me', avatar: null };
const friend = { id: '2', username: 'friend', global_name: 'Friend', avatar: null };

const priv = (over: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id: '9', channel_id: '500', guild_id: null, author: friend, content: 'hi <@1>', timestamp: '2026-10-17T10:00:00.000Z', edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, deliveryMode: 'ephemeral', ...over }) as ChatMessage;

describe('registerIncoming for private messages (client#154)', () => {
  beforeEach(() => {
    useSessionStore.setState({ user: me } as never);
    useReadStateStore.setState({ byChannel: {} } as never);
    useMentionInboxStore.setState({ entries: [] } as never);
    useGuildStore.setState({ channels: {}, guilds: {}, members: {} } as never);
  });

  it('counts a mention and notifies for a decrypted ephemeral message', () => {
    const notify = vi.fn();
    registerIncoming(priv({ mentions: [me] as never }), notify);
    expect(useReadStateStore.getState().byChannel['500']?.mentionCount).toBe(1);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('marks our own mirrored message read and still hands it to notify (which ignores own)', () => {
    const notify = vi.fn();
    registerIncoming(priv({ author: me }), notify);
    expect(useReadStateStore.getState().byChannel['500']?.mentionCount ?? 0).toBe(0);
  });
});
