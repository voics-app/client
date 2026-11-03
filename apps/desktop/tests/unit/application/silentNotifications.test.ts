import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notify, flashFrame } = vi.hoisted(() => ({ notify: vi.fn(), flashFrame: vi.fn() }));
vi.mock('@renderer/interface/app/bridge', () => ({ bridge: { app: { notify, flashFrame } } }));

import { notifyIncoming } from '@renderer/interface/app/notifications';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import type { ChatMessage } from '@renderer/application/stores/messageStore';

const me = { id: '1', username: 'me', global_name: null, avatar: null };
const friend = { id: '2', username: 'friend', global_name: null, avatar: null };
const dm = (extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id: '9', channel_id: '300', guild_id: null, author: friend, content: 'hello', timestamp: '2026-10-16T10:00:00.000Z', edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as ChatMessage;

describe('notifyIncoming and @silent', () => {
  beforeEach(() => {
    notify.mockClear();
    flashFrame.mockClear();
    useSessionStore.setState({ user: me, settings: { status: 'online' } } as never);
    usePrefsStore.setState({ notifyDesktop: true, notifySounds: true, flashTaskbar: true, notifyOnlyMentions: false } as never);
    vi.stubGlobal('document', { hasFocus: () => false });
  });

  it('notifies for an ordinary DM', () => {
    notifyIncoming(dm());
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('gives a silent message no desktop notification, sound or taskbar flash', () => {
    notifyIncoming(dm({ flags: 1 << 12 }));
    expect(notify).not.toHaveBeenCalled();
    expect(flashFrame).not.toHaveBeenCalled();
  });
});
