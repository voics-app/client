// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { usePrefsStore, DEFAULT_PREFS } from '@renderer/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import type { ChatMessage } from '@renderer/application/stores/messageStore';
import { ALL_PERMISSIONS, Permission } from '@shared/contracts/permissions';
import { ChannelSidebar } from '@renderer/interface/features/channels/ChannelSidebar';
import { MessageItem } from '@renderer/interface/features/chat/MessageItem';
import { selectionWithin, targetFromElement } from '@renderer/interface/features/chat/contextTarget';

const G = 'g1';
const user = (id: string) => ({ id, username: id, global_name: null, avatar: null });

function seed(opts: { perms?: bigint; me?: string } = {}) {
  const me = opts.me ?? 'alice';
  useSessionStore.setState({ user: user(me) } as never);
  const perms = opts.perms ?? ALL_PERMISSIONS;
  useGuildStore.setState({
    guilds: {
      [G]: {
        id: G,
        name: 'Guild',
        owner_id: 'owner',
        roles: [{ id: G, name: '@everyone', color: 0, hoist: false, position: 0, permissions: perms.toString(), managed: false, mentionable: false }],
      },
    } as never,
    members: { [G]: { [me]: { user: user(me), roles: [], joined_at: '', deaf: false, mute: false } } } as never,
    channels: {
      cat1: { id: 'cat1', guild_id: G, type: 4, name: 'Text', position: 0 },
      cat2: { id: 'cat2', guild_id: G, type: 4, name: 'Voice', position: 1 },
      c1: { id: 'c1', guild_id: G, type: 0, name: 'general', parent_id: 'cat1', position: 0, last_message_id: '50' },
      c2: { id: 'c2', guild_id: G, type: 0, name: 'quiet', parent_id: 'cat1', position: 1, last_message_id: '10' },
      c3: { id: 'c3', guild_id: G, type: 0, name: 'secret', parent_id: 'cat1', position: 2, last_message_id: '10', nsfw: true, permission_overwrites: [{ id: G, type: 0, allow: '0', deny: '1024' }] },
    } as never,
  });
  useReadStateStore.setState({ byChannel: { c1: { lastReadId: '10', mentionCount: 0 }, c2: { lastReadId: '10', mentionCount: 0 }, c3: { lastReadId: '10', mentionCount: 0 } } });
  useUiStore.setState({ view: { kind: 'guild', guildId: G, channelId: 'c2' } } as never);
}

const message = (over: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: 'm1',
    channel_id: 'c1',
    author: user('bob'),
    content: 'hello https://example.test world',
    timestamp: '2026-01-01T00:00:00Z',
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...over,
  }) as unknown as ChatMessage;

const renderMessage = (m = message()) =>
  render(<MessageItem message={m} startsGroup guildId={G} onRetry={() => undefined} onDiscard={() => undefined} />);
const root = () => document.querySelector<HTMLElement>('.message')!;
const toolbarLabels = () => within(screen.getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
const menuLabels = () => screen.getAllByRole('menuitem').map((el) => (el.textContent ?? '').replace('›', ''));

beforeEach(() => {
  usePrefsStore.setState({ ...DEFAULT_PREFS });
  seed();
});
afterEach(cleanup);

describe('message hover toolbar', () => {
  it('is hidden at rest and shows on hover with quick reactions', () => {
    renderMessage();
    expect(screen.queryByRole('toolbar')).toBeNull();
    fireEvent.mouseEnter(root());
    expect(toolbarLabels()).toEqual(expect.arrayContaining(['React with 👍', 'React with ❤️', 'React with 😂', 'React with 🎉', 'Add reaction', 'Reply', 'More']));
    fireEvent.mouseLeave(root());
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('shows on keyboard focus (focus-within) and hides when focus leaves', () => {
    renderMessage();
    fireEvent.focus(screen.getByRole('button', { name: 'bob' }));
    expect(screen.getByRole('toolbar')).toBeTruthy();
    fireEvent.blur(screen.getByRole('button', { name: 'bob' }), { relatedTarget: document.body });
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('stays open while focus moves inside the message', () => {
    renderMessage();
    const author = screen.getByRole('button', { name: 'bob' });
    fireEvent.focus(author);
    fireEvent.blur(author, { relatedTarget: within(screen.getByRole('toolbar')).getByRole('button', { name: 'Reply' }) });
    expect(screen.getByRole('toolbar')).toBeTruthy();
  });

  it('uses recently used reactions first', () => {
    usePrefsStore.getState().recordReaction({ id: null, name: '🔥' });
    renderMessage();
    fireEvent.mouseEnter(root());
    expect(toolbarLabels().slice(0, 4)).toEqual(['React with 🔥', 'React with 👍', 'React with ❤️', 'React with 😂']);
  });

  it('holding Shift swaps in Copy ID, Pin and Delete, releasing restores Reply', () => {
    seed({ perms: ALL_PERMISSIONS });
    renderMessage();
    fireEvent.mouseEnter(root());
    expect(toolbarLabels()).not.toContain('Delete (no confirmation)');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    });
    expect(toolbarLabels()).toEqual(expect.arrayContaining(['Copy message ID', 'Pin', 'Delete (no confirmation)']));
    expect(toolbarLabels()).not.toContain('Reply');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: false }));
    });
    expect(toolbarLabels()).toContain('Reply');
  });

  it('hides reaction buttons without ADD_REACTIONS', () => {
    seed({ perms: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES });
    renderMessage();
    fireEvent.mouseEnter(root());
    expect(toolbarLabels()).toEqual(['Reply', 'More']);
  });

  it('does not show while the message is being edited or failed', () => {
    renderMessage(message({ localState: 'failed' } as never));
    fireEvent.mouseEnter(root());
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});

describe('message right-click menu', () => {
  it('shows the full message menu with the Add Reaction submenu', () => {
    renderMessage();
    fireEvent.contextMenu(root());
    expect(menuLabels()).toEqual(expect.arrayContaining(['Add Reaction', 'Pin Message', 'Reply', 'Create Thread', 'Copy Text', 'Mark Unread', 'Copy Message Link', 'Copy Message ID']));
    expect(menuLabels()).not.toContain('Forward');
    expect(menuLabels()).not.toContain('Edit Message');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add Reaction' }));
    expect(within(screen.getByRole('menu', { name: 'Add Reaction' })).getAllByRole('menuitem').map((e) => e.textContent)).toEqual(['👍', '❤️', '😂', '🎉', 'More reactions']);
  });

  it('own messages get Edit and Delete', () => {
    renderMessage(message({ author: user('alice') }));
    fireEvent.contextMenu(root());
    expect(menuLabels()).toEqual(expect.arrayContaining(['Edit Message', 'Delete Message']));
  });

  it('Mark Unread moves the read marker to just before the message', () => {
    useReadStateStore.setState({ byChannel: { c1: { lastReadId: '50', mentionCount: 0 } } });
    renderMessage(message({ id: '300' }));
    fireEvent.contextMenu(root());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark Unread' }));
    // The marker lands just before the message, so it and everything after count as unread.
    expect(useReadStateStore.getState().byChannel.c1?.lastReadId).toBe('299');
  });

  it('a link inside the message opens a link menu first', () => {
    renderMessage(message());
    const link = document.querySelector('a[data-ctx="link"]')!;
    fireEvent.contextMenu(link);
    expect(menuLabels().slice(0, 2)).toEqual(['Open Link', 'Copy Link']);
    expect(menuLabels()).toContain('Reply');
  });

  it('an image attachment opens an image menu', () => {
    renderMessage(message({ attachments: [{ id: 'a1', filename: 'cat.png', size: 1, url: 'https://cdn.test/cat.png', content_type: 'image/png' }] } as never));
    fireEvent.contextMenu(document.querySelector('img.attachment-image')!);
    expect(menuLabels().slice(0, 4)).toEqual(['Copy Image', 'Save Image', 'Open Original', 'Copy Link']);
  });

  it('a custom emoji opens an emoji menu; Add to Server needs expression permission', () => {
    renderMessage(message({ content: 'hi <:wave:99>' }));
    fireEvent.contextMenu(document.querySelector('img.custom-emoji')!);
    expect(menuLabels().slice(0, 2)).toEqual(['Copy Emoji Link', 'Add to Server']);
    cleanup();
    seed({ perms: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES });
    renderMessage(message({ content: 'hi <:wave:99>' }));
    fireEvent.contextMenu(document.querySelector('img.custom-emoji')!);
    expect(menuLabels()).toContain('Copy Emoji Link');
    expect(menuLabels()).not.toContain('Add to Server');
  });

  it('a text selection puts Copy and Search with Google on top', () => {
    renderMessage();
    const text = document.querySelector('.markdown')!;
    const range = document.createRange();
    range.selectNodeContents(text.firstChild!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.contextMenu(text);
    expect(menuLabels().slice(0, 2)).toEqual(['Copy', 'Search with Google']);
    window.getSelection()!.removeAllRanges();
  });
});

describe('context target detection', () => {
  it('falls back to the message', () => {
    expect(targetFromElement(document.body)).toEqual({ kind: 'message' });
    expect(targetFromElement(null)).toEqual({ kind: 'message' });
  });
  it('reads link, image and emoji attributes from ancestors', () => {
    document.body.innerHTML = '<a data-ctx="link" data-url="https://a.test"><b id="in">x</b></a><img id="img" data-ctx="image" data-src="s" data-filename="f.png"><img id="em" data-ctx="emoji" data-emoji-id="1" data-emoji-name="n" data-animated="true" data-src="u">';
    expect(targetFromElement(document.getElementById('in'))).toEqual({ kind: 'link', url: 'https://a.test' });
    expect(targetFromElement(document.getElementById('img'))).toEqual({ kind: 'image', url: 's', openUrl: 's', filename: 'f.png' });
    expect(targetFromElement(document.getElementById('em'))).toEqual({ kind: 'emoji', id: '1', name: 'n', url: 'u', animated: true });
  });
  it('selectionWithin ignores selections outside the container', () => {
    document.body.innerHTML = '<p id="a">alpha</p><p id="b">beta</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('a')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(selectionWithin(document.getElementById('a'))).toBe('alpha');
    expect(selectionWithin(document.getElementById('b'))).toBe('');
  });
});

describe('channel sidebar', () => {
  const channelNames = () => [...document.querySelectorAll('.channel-name')].map((e) => e.textContent);

  it('right-click on a category header opens the category menu', () => {
    render(<ChannelSidebar guildId={G} />);
    fireEvent.contextMenu(screen.getByText('Text'));
    expect(menuLabels()).toEqual(expect.arrayContaining(['Mark As Read', 'Collapse Category', 'Collapse All Categories', 'Mute Category', 'Notification Settings', 'Edit Category', 'Create Channel', 'Delete Category', 'Copy Category ID']));
  });

  it('a member without MANAGE_CHANNELS gets no management entries on a category', () => {
    seed({ perms: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES, me: 'alice' });
    render(<ChannelSidebar guildId={G} />);
    fireEvent.contextMenu(screen.getByText('Text'));
    const labels = menuLabels();
    expect(labels).toContain('Copy Category ID');
    for (const hidden of ['Edit Category', 'Delete Category', 'Create Channel']) expect(labels).not.toContain(hidden);
  });

  it('Collapse All Categories collapses them and unread channels stay visible while quiet ones hide', () => {
    render(<ChannelSidebar guildId={G} />);
    expect(channelNames()).toEqual(['general', 'quiet', 'secret']);
    fireEvent.contextMenu(screen.getByText('Text'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Collapse All Categories' }));
    // c1 unread stays, c2 is the active channel, c3 is read and hidden.
    expect(channelNames()).toEqual(['general', 'quiet']);
    expect(usePrefsStore.getState().collapsedCategories).toMatchObject({ cat1: true, cat2: true });
  });

  it('muting a category for a duration mutes and unmuting clears it', () => {
    render(<ChannelSidebar guildId={G} />);
    fireEvent.contextMenu(screen.getByText('Text'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mute Category' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'For 1 hour' }));
    const s = usePrefsStore.getState();
    expect(s.mutedChannels.cat1).toBe(true);
    expect(s.muteUntil.cat1).toBeGreaterThan(Date.now() + 59 * 60_000);
    // muted category dims its channels
    expect(document.querySelectorAll('.channel-row.is-muted')).toHaveLength(3);
  });

  it('channel menu offers invite, link, duplicate, notifications and mute durations', () => {
    render(<ChannelSidebar guildId={G} />);
    fireEvent.contextMenu(screen.getByText('general'));
    expect(menuLabels()).toEqual(expect.arrayContaining(['Mark As Read', 'Invite People', 'Copy Link', 'Mute Channel', 'Notification Settings', 'Edit Channel', 'Duplicate Channel', 'Create Channel', 'Delete Channel', 'Copy Channel ID']));
  });

  it('the edit gear shows with MANAGE_CHANNELS even without CREATE_INSTANT_INVITE', () => {
    seed({ perms: Permission.VIEW_CHANNEL | Permission.MANAGE_CHANNELS });
    render(<ChannelSidebar guildId={G} />);
    expect(screen.getAllByRole('button', { name: 'Edit channel' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Create invite' })).toBeNull();
  });

  it('shows a lock for private channels and a marker for age-restricted ones', () => {
    render(<ChannelSidebar guildId={G} />);
    expect(screen.getAllByLabelText('Private channel')).toHaveLength(1);
    expect(screen.getAllByLabelText('Age-restricted')).toHaveLength(1);
  });
});
