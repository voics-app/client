// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PERMISSIONS } from '@discordy/core/contracts/permissions';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useLightboxStore } from '@discordy/core/application/stores/lightboxStore';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { DEFAULT_PREFS, usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUploadStore } from '@discordy/core/application/stores/uploadStore';
import { MessageItem } from '@renderer/interface/features/chat/MessageItem';

const editMessage = vi.fn(async () => ({}));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { editMessage } }) }));

const G = 'g1';
const user = (id: string) => ({ id, username: id, global_name: null, avatar: null });
const image = (id: string, extra: object = {}) => ({ id, filename: `${id}.png`, content_type: 'image/png', size: 10, url: `http://cdn/attachments/1/${id}/${id}.png?ex=ffffffffff&is=1&hm=ab`, width: 40, height: 30, ...extra });

const message = (over: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: 'm1',
    channel_id: 'c1',
    guild_id: G,
    author: user('bob'),
    content: 'hi',
    timestamp: '2026-01-01T00:00:00Z',
    edited_timestamp: null,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...over,
  }) as unknown as ChatMessage;

const renderMessage = (m: ChatMessage) => render(<MessageItem message={m} startsGroup guildId={G} onRetry={() => undefined} onDiscard={() => undefined} />);

const linkEmbed = {
  type: 'link' as const,
  url: 'https://site.example/post',
  title: 'A post',
  description: 'About things',
  provider: { name: 'Site' },
  thumbnail: { url: 'https://img.example/t.png', proxy_url: 'http://cdn/external/abc?ex=ffffffffff&is=1&hm=ab', width: 20, height: 10 },
};

function seed(me: string, perms = ALL_PERMISSIONS) {
  useSessionStore.setState({ user: user(me) } as never);
  useGuildStore.setState({
    guilds: { [G]: { id: G, name: 'Guild', owner_id: 'owner', roles: [{ id: G, name: '@everyone', color: 0, hoist: false, position: 0, permissions: perms.toString(), managed: false, mentionable: false }] } } as never,
    members: { [G]: { [me]: { user: user(me), roles: [], joined_at: '', deaf: false, mute: false } } } as never,
    channels: { c1: { id: 'c1', guild_id: G, type: 0, name: 'general', position: 0 } } as never,
  });
}

beforeEach(() => {
  editMessage.mockClear();
  usePrefsStore.setState({ ...DEFAULT_PREFS });
  useLightboxStore.getState().close();
  useUploadStore.setState({ uploads: {} });
  seed('alice');
});
afterEach(cleanup);

describe('attachments', () => {
  it('blurs spoilers until clicked, then opens the viewer on the next click', () => {
    renderMessage(message({ attachments: [image('a', { filename: 'SPOILER_a.png' })] as never }));
    const tile = screen.getByRole('button', { name: /Spoiler: a\.png/ });
    expect(tile.className).toContain('is-spoiler');
    expect(screen.getByText('Spoiler')).toBeTruthy();
    fireEvent.click(tile);
    expect(useLightboxStore.getState().items).toEqual([]);
    const opened = screen.getByRole('button', { name: 'Open a.png' });
    expect(opened.className).not.toContain('is-spoiler');
    fireEvent.click(opened);
    expect(useLightboxStore.getState().items).toHaveLength(1);
  });

  it('honours the server spoiler flag and shows alt text', () => {
    renderMessage(message({ attachments: [image('a', { flags: 8 }), image('b', { description: 'a red cat' })] as never }));
    expect(screen.getByRole('button', { name: /Spoiler: a\.png/ })).toBeTruthy();
    expect(screen.getByAltText('a red cat')).toBeTruthy();
    expect(screen.getByText('ALT')).toBeTruthy();
  });

  it('lays several images out in a grid and opens the clicked one with its siblings', () => {
    renderMessage(message({ attachments: [image('a'), image('b'), image('c')] as never }));
    expect(document.querySelector('.media-grid')?.getAttribute('data-count')).toBe('3');
    expect(document.querySelectorAll('.media-tile')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Open b.png' }));
    const { items, index } = useLightboxStore.getState();
    expect(items.map((i) => i.filename)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(index).toBe(1);
  });

  it('shows at most four tiles with a +N on the last and opens the carousel from there', () => {
    renderMessage(message({ attachments: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => image(id)) as never }));
    expect(document.querySelector('.media-grid')?.getAttribute('data-count')).toBe('4');
    expect(document.querySelectorAll('.media-tile')).toHaveLength(4);
    expect(document.querySelector('.media-more')?.textContent).toBe('+2');
    fireEvent.click(screen.getByRole('button', { name: 'Open d.png' }));
    const { items, index } = useLightboxStore.getState();
    expect(items).toHaveLength(6);
    expect(index).toBe(3);
  });

  it('shows no +N when everything fits', () => {
    renderMessage(message({ attachments: ['a', 'b', 'c', 'd'].map((id) => image(id)) as never }));
    expect(document.querySelector('.media-more')).toBeNull();
  });

  it('keeps files out of the grid and shows a PDF card', () => {
    renderMessage(message({ attachments: [image('a'), { id: 'p', filename: 'doc.pdf', content_type: 'application/pdf', size: 2048, url: 'http://cdn/doc.pdf' }] as never }));
    expect(document.querySelectorAll('.media-tile')).toHaveLength(1);
    expect(screen.getByText(/PDF · 2\.0 KB/)).toBeTruthy();
  });

  it('shows upload progress with a working cancel for a message being sent', () => {
    const abort = vi.fn();
    useUploadStore.getState().begin('n1', 1000, abort);
    useUploadStore.getState().progress('n1', 250);
    renderMessage(message({ id: 'n1', nonce: 'n1', localState: 'sending' } as never));
    expect(screen.getByRole('status', { name: /Uploading, 25 percent/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(abort).toHaveBeenCalledOnce();
  });
});

describe('link embeds', () => {
  it('load media only from the signed proxy URL', () => {
    renderMessage(message({ embeds: [linkEmbed] as never }));
    const srcs = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toContain(linkEmbed.thumbnail.proxy_url);
    expect(srcs.some((s) => s?.includes('img.example'))).toBe(false);
    expect(screen.getByText('A post')).toBeTruthy();
    expect(screen.getByText('Site')).toBeTruthy();
  });

  it('never loads a remote image that has no proxy URL', () => {
    renderMessage(message({ embeds: [{ ...linkEmbed, thumbnail: { url: 'https://img.example/t.png' } }] as never }));
    expect([...document.querySelectorAll('img')].some((img) => img.getAttribute('src')?.includes('img.example'))).toBe(false);
  });

  it('plays an allow-listed video in a sandboxed iframe only after a click', () => {
    renderMessage(message({ embeds: [{ type: 'video', url: 'https://youtu.be/x', title: 'Clip', provider: { name: 'YouTube' }, video: { url: 'https://www.youtube.com/embed/x', width: 640, height: 360 } }] as never }));
    expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play Clip' }));
    const frame = document.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('https://www.youtube.com/embed/x');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
  });

  it('does not play a video on an unknown host without a proxy URL', () => {
    renderMessage(message({ embeds: [{ type: 'video', url: 'https://evil.example/', title: 'Clip', video: { url: 'https://evil.example/player' } }] as never }));
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play Clip' })).toBeNull();
  });

  it('can be hidden in settings, but bot embeds stay', () => {
    usePrefsStore.setState({ linkPreviews: false });
    renderMessage(message({ embeds: [linkEmbed, { type: 'rich', title: 'Bot embed' }] as never }));
    expect(screen.queryByText('A post')).toBeNull();
    expect(screen.getByText('Bot embed')).toBeTruthy();
  });

  it('lets the author remove previews with the x, which sends SUPPRESS_EMBEDS', async () => {
    seed('bob', 0n);
    useSessionStore.setState({ user: user('bob') } as never);
    const m = message({ embeds: [linkEmbed] as never });
    useMessageStore.getState().receive(m as never);
    renderMessage(m);
    fireEvent.click(screen.getByRole('button', { name: /Remove all link previews/ }));
    await waitFor(() => expect(editMessage).toHaveBeenCalledWith('c1', 'm1', { flags: 4 }));
  });

  it('offers no x to someone who neither wrote the message nor moderates', () => {
    seed('carol', 0n);
    renderMessage(message({ embeds: [linkEmbed] as never }));
    expect(screen.queryByRole('button', { name: /Remove all link previews/ })).toBeNull();
  });

  it('offers the x to a moderator and not in private chats', () => {
    renderMessage(message({ embeds: [linkEmbed] as never }));
    expect(screen.getByRole('button', { name: /Remove all link previews/ })).toBeTruthy();
    cleanup();
    renderMessage(message({ embeds: [linkEmbed], deliveryMode: 'ephemeral' } as never));
    expect(screen.queryByRole('button', { name: /Remove all link previews/ })).toBeNull();
  });
});

describe('chat display preferences', () => {
  const setPref = (p: Partial<typeof DEFAULT_PREFS>) => usePrefsStore.setState({ ...DEFAULT_PREFS, ...p });
  const reply = { id: 'r0', channel_id: 'c1', author: user('carol'), content: 'first line\nsecond line', attachments: [], embeds: [], timestamp: '2026-01-01T00:00:00Z' };

  it('inlineMedia off lists images as file links, not tiles', () => {
    setPref({ inlineMedia: false });
    renderMessage(message({ attachments: [image('a')] as never }));
    expect(document.querySelectorAll('.media-tile')).toHaveLength(0);
    expect(document.querySelector('a.attachment-file')).toBeTruthy();
    cleanup();
    setPref({ inlineMedia: true });
    renderMessage(message({ attachments: [image('a')] as never }));
    expect(document.querySelectorAll('.media-tile')).toHaveLength(1);
  });

  it('inlineEmbeds off hides every embed', () => {
    setPref({ inlineEmbeds: false });
    renderMessage(message({ embeds: [linkEmbed] as never }));
    expect(screen.queryByText('A post')).toBeNull();
    cleanup();
    setPref({ inlineEmbeds: true });
    renderMessage(message({ embeds: [linkEmbed] as never }));
    expect(screen.getByText('A post')).toBeTruthy();
  });

  it('spoilerDisplay: click keeps it hidden, always reveals, moderated follows MANAGE_MESSAGES', () => {
    const spoilerMsg = () => message({ content: '||secret||', attachments: [image('a', { filename: 'SPOILER_a.png' })] as never });
    setPref({ spoilerDisplay: 'click' });
    renderMessage(spoilerMsg());
    expect(document.querySelector('.spoiler.is-shown')).toBeNull();
    expect(screen.getByRole('button', { name: /Spoiler: a\.png/ })).toBeTruthy();
    cleanup();
    setPref({ spoilerDisplay: 'always' });
    renderMessage(spoilerMsg());
    expect(document.querySelector('.spoiler.is-shown')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open a.png' })).toBeTruthy();
    cleanup();
    setPref({ spoilerDisplay: 'moderated' });
    renderMessage(spoilerMsg()); // seeded with all permissions
    expect(document.querySelector('.spoiler.is-shown')).toBeTruthy();
    cleanup();
    seed('alice', 0n);
    renderMessage(spoilerMsg());
    expect(document.querySelector('.spoiler.is-shown')).toBeNull();
  });

  it('showReactions off hides the reaction bar', () => {
    const m = message({ reactions: [{ emoji: { id: null, name: '👍' }, count: 2, me: false }] as never });
    setPref({ showReactions: false });
    renderMessage(m);
    expect(document.querySelector('.reactions')).toBeNull();
    cleanup();
    setPref({ showReactions: true });
    renderMessage(m);
    expect(document.querySelector('.reactions')).toBeTruthy();
  });

  it('compactReplyPreview drops the avatar and flattens the quoted text', () => {
    const m = message({ message_reference: { message_id: 'r0' }, referenced_message: reply } as never);
    setPref({ compactReplyPreview: true });
    renderMessage(m);
    expect(document.querySelector('.reply-preview.is-compact')).toBeTruthy();
    expect(document.querySelector('.reply-text')?.textContent).toBe('first line second line');
    cleanup();
    setPref({ compactReplyPreview: false });
    renderMessage(m);
    expect(document.querySelector('.reply-preview.is-compact')).toBeNull();
  });
});
