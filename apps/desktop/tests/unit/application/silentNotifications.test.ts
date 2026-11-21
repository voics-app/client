import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notify, flashFrame, play } = vi.hoisted(() => ({ notify: vi.fn(), flashFrame: vi.fn(), play: vi.fn() }));
vi.mock('@renderer/infrastructure/audio/sfx', () => ({ soundEffects: { play } }));
vi.mock('@renderer/interface/app/bridge', () => ({ bridge: { app: { notify, flashFrame } } }));

import { notifyIncoming } from '@renderer/interface/app/notifications';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { confirmAgeRestrictedChannel, initialiseAgeRestrictedAccess } from '@discordy/core/application/ageRestrictedAccess';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';

const me = { id: '1', username: 'me', global_name: null, avatar: null };
const friend = { id: '2', username: 'friend', global_name: null, avatar: null };
const dm = (extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id: '9', channel_id: '300', guild_id: null, author: friend, content: 'hello', timestamp: '2026-10-16T10:00:00.000Z', edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as ChatMessage;

describe('notifyIncoming and @silent', () => {
  beforeEach(() => {
    notify.mockClear();
    flashFrame.mockClear();
    play.mockClear();
    useUiStore.setState({ view: { channelId: null } } as never);
    useSessionStore.setState({ user: me, settings: { status: 'online' } } as never);
    useGuildStore.getState().reset();
    useGuildStore.getState().upsertChannel({ id: '300', type: 1, recipients: [friend], delivery_mode: 'standard' });
    usePrefsStore.setState({ notifyDesktop: true, notifySounds: true, soundToggles: {}, flashTaskbar: true, notifyOnlyMentions: false, streamerMode: false, streamerAutoDetect: false } as never);
    vi.stubGlobal('document', { hasFocus: () => false });
  });

  it('notifies for an ordinary DM and plays the message sound in the app, with a silent toast', () => {
    notifyIncoming(dm());
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ silent: true });
    expect(play).toHaveBeenCalledWith('message', expect.any(Number), null);
  });

  it('still plays the sound when desktop notifications are off', () => {
    usePrefsStore.setState({ notifyDesktop: false } as never);
    notifyIncoming(dm());
    expect(notify).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('redacts DM content and suppresses sound in streamer mode, restoring them when disabled', () => {
    usePrefsStore.setState({ streamerMode: true });
    notifyIncoming(dm());
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ body: 'New direct message', silent: true });
    expect(play).not.toHaveBeenCalled();
    usePrefsStore.setState({ streamerMode: false });
    notifyIncoming(dm());
    expect(notify.mock.calls[1]?.[0].body).toContain('hello');
    expect(play).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the master sound switch is off', () => usePrefsStore.setState({ notifySounds: false } as never)],
    ['the message sound is off', () => usePrefsStore.setState({ soundToggles: { message: false } } as never)],
    ['Do Not Disturb is on', () => useSessionStore.setState({ settings: { status: 'dnd' } } as never)],
    ['the channel is open and focused', () => {
      vi.stubGlobal('document', { hasFocus: () => true });
      useUiStore.setState({ view: { channelId: '300' } } as never);
    }],
  ])('plays no sound when %s', (_name, arrange) => {
    arrange();
    notifyIncoming(dm());
    expect(play).not.toHaveBeenCalled();
  });

  it('gives a silent message no desktop notification, sound or taskbar flash', () => {
    notifyIncoming(dm({ flags: 1 << 12 }));
    expect(notify).not.toHaveBeenCalled();
    expect(flashFrame).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('withholds a restricted mention preview and sound until this channel is confirmed', () => {
    initialiseAgeRestrictedAccess('https://instance.test');
    useSessionStore.getState().setStatus('ready');
    useGuildStore.getState().upsertChannel({ id: 'r', type: 0, guild_id: 'g', nsfw: true, delivery_mode: 'standard' });
    const message = dm({ channel_id: 'r', guild_id: 'g', mentions: [me] });
    notifyIncoming(message);
    expect(notify).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    confirmAgeRestrictedChannel('r');
    notifyIncoming(message);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
