// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useMentionStore } from '@discordy/core/application/stores/mentionStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useDraftStore, useReplyPingStore, useSlowmodeStore } from '@discordy/core/application/stores/composerStores';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Channel, Message, User } from '@discordy/core/contracts/rest';

const send = vi.fn(async () => null);
const gifs = vi.fn(async () => ({ results: [{ id: '1', content_description: 'Happy cat', media_formats: { gif: { url: 'https://example.test/cat.gif' }, tinygif: { url: 'https://example.test/cat.gif', proxy_url: 'https://cdn.example.test/external/signed' } } }] }));
const gifCategories = vi.fn(async () => ({ tags: [{ name: 'Cats', searchterm: 'cats' }] }));
const updateSettings = vi.fn(async (patch: { preferences: { favorite_gifs: string[] } }) => ({ default_delivery_mode: 'standard', preferences: patch.preferences }));
vi.mock('@renderer/interface/app/runtime', () => ({
  getRuntime: () => ({ privacy: { sender: { send } }, api: { typing: async () => undefined, gifs, gifCategories, updateSettings }, interactions: {} }),
}));
vi.mock('@renderer/interface/features/privacy/ModeSwitcher', () => ({ ModeSwitcher: () => null }));
vi.mock('@renderer/interface/features/privacy/PeerStatus', () => ({ PeerStatus: () => null }));

import { Composer } from '@renderer/interface/features/chat/Composer';
import { useFailedSendQueue } from '@renderer/interface/features/chat/failedSendQueue';

const ME = 'me';
const G = 'g1';
const user = (id: string) => ({ id, username: id, global_name: null, avatar: null }) as unknown as User;
const guildChannel = (extra: Partial<Channel> = {}): Channel =>
  ({ id: 'c1', guild_id: G, type: 0, name: 'general', position: 0, ...extra }) as unknown as Channel;
const dmChannel = (): Channel => ({ id: 'dm1', type: 1, recipients: [user('bob')] }) as unknown as Channel;

function seedGuild(permissions: bigint, channel: Channel) {
  useSessionStore.setState({ user: user(ME) } as never);
  useGuildStore.setState({
    guilds: { [G]: { id: G, name: 'G', owner_id: 'owner', roles: [{ id: G, name: '@everyone', color: 0, hoist: false, position: 0, permissions: permissions.toString(), managed: false, mentionable: false }], emojis: [] } } as never,
    members: { [G]: { [ME]: { user: user(ME), roles: [], joined_at: '2026-01-01T00:00:00Z', deaf: false, mute: false } } } as never,
    channels: { [channel.id]: channel } as never,
  });
}

const BASE = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.ATTACH_FILES;
const input = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const type = (value: string) => fireEvent.change(input(), { target: { value, selectionStart: value.length } });

beforeEach(() => {
  useFailedSendQueue.getState().clear();
  send.mockClear();
  useSessionStore.setState({ status: 'ready' });
  useDraftStore.setState({ drafts: {} });
  useSlowmodeStore.setState({ lastSent: {} });
  useReplyPingStore.setState({ ping: true });
  useUiStore.setState({ replyTo: {}, editing: null, toasts: [] } as never);
  useMessageStore.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Composer: sending and newlines', () => {
  it('opens GIFs, saves a favorite, inserts a link and sends it', async () => {
    const c = dmChannel();
    render(<Composer channel={c} mode="standard" />);
    fireEvent.click(screen.getByRole('button', { name: 'GIF' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cats' }));
    const gif = await screen.findByRole('button', { name: 'Insert Happy cat' });
    fireEvent.click(screen.getByRole('button', { name: 'Add favorite' }));
    expect(updateSettings).toHaveBeenCalledWith({ preferences: { favorite_gifs: ['https://example.test/cat.gif'] } });
    fireEvent.click(gif);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledWith(c, expect.objectContaining({ content: 'https://example.test/cat.gif' }));
  });
  it('Enter sends and Shift+Enter does not', () => {
    const c = dmChannel();
    render(<Composer channel={c} mode="standard" />);
    type('hello');
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('Composer: reply ping and @silent', () => {
  const replyTarget = (author: string) => ({ id: 'm9', channel_id: 'dm1', author: user(author), content: 'original' }) as unknown as Message;

  it('toggles the reply ping, remembers it, and sends pingReplied false', () => {
    const c = dmChannel();
    useSessionStore.setState({ user: user(ME) } as never);
    useUiStore.setState({ replyTo: { [c.id]: replyTarget('bob') } } as never);
    render(<Composer channel={c} mode="standard" />);
    const toggle = screen.getByRole('button', { name: /Mention bob: on/ });
    expect(toggle.textContent).toContain('ON');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Mention bob: off/ }).textContent).toContain('OFF');
    expect(useReplyPingStore.getState().ping).toBe(false);
    type('answer');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ replyTo: 'm9', pingReplied: false }));
  });

  it('starts from the last remembered choice and hides the toggle for your own message', () => {
    const c = dmChannel();
    useSessionStore.setState({ user: user(ME) } as never);
    useReplyPingStore.setState({ ping: false });
    useUiStore.setState({ replyTo: { [c.id]: replyTarget('bob') } } as never);
    render(<Composer channel={c} mode="standard" />);
    expect(screen.getByRole('button', { name: /Mention bob: off/ })).toBeTruthy();
    cleanup();
    useUiStore.setState({ replyTo: { [c.id]: replyTarget(ME) } } as never);
    render(<Composer channel={c} mode="standard" />);
    expect(screen.queryByRole('button', { name: /Mention/ })).toBeNull();
  });

  it('strips the @silent prefix and sends silent', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    type('@silent psst');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ content: 'psst', silent: true }));
  });

  it('leaves a bare @silent as ordinary text', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    type('@silent');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ content: '@silent', silent: false }));
  });

  it('retains the reply target and ping choice when a silent reply fails and is sent again', async () => {
    const c = dmChannel();
    const target = replyTarget('bob');
    useSessionStore.setState({ user: user(ME) } as never);
    useUiStore.setState({ replyTo: { [c.id]: target } } as never);
    useReplyPingStore.setState({ ping: false });
    send.mockRejectedValueOnce(new Error('Offline'));
    render(<Composer channel={c} mode="standard" />);
    type('@silent answer');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(input().value).toBe('@silent answer'));
    expect(useUiStore.getState().replyTo[c.id]?.id).toBe('m9');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ content: 'answer', silent: true, replyTo: 'm9', pingReplied: false }));
  });

  it('does not advertise the Standard-only ping control in a private chat', () => {
    const c = dmChannel();
    useSessionStore.setState({ user: user(ME) } as never);
    useUiStore.setState({ replyTo: { [c.id]: replyTarget('bob') } } as never);
    render(<Composer channel={c} mode="ephemeral" />);
    expect(screen.queryByRole('button', { name: /Mention bob/ })).toBeNull();
  });

  it('does not attach a failed reply to a newer draft', async () => {
    const c = dmChannel();
    useSessionStore.setState({ user: user(ME) } as never);
    useUiStore.setState({ replyTo: { [c.id]: replyTarget('bob') } } as never);
    let reject!: (error: Error) => void;
    send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    render(<Composer channel={c} mode="standard" />);
    type('first answer');
    fireEvent.keyDown(input(), { key: 'Enter' });
    type('new draft');
    await act(async () => reject(new Error('Offline')));
    expect(input().value).toBe('new draft');
    expect(useUiStore.getState().replyTo[c.id]).toBeNull();
    expect((screen.getByRole('button', { name: 'Restore failed message' }) as HTMLButtonElement).disabled).toBe(true);
    type('');
    fireEvent.click(screen.getByRole('button', { name: 'Restore failed message' }));
    expect(input().value).toBe('first answer');
    expect(useUiStore.getState().replyTo[c.id]?.id).toBe('m9');
  });

  it('does not restore failed text into a newly selected reply', async () => {
    const c = dmChannel();
    useSessionStore.setState({ user: user(ME) } as never);
    useUiStore.setState({ replyTo: { [c.id]: replyTarget('bob') } } as never);
    let reject!: (error: Error) => void;
    send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    render(<Composer channel={c} mode="standard" />);
    type('answer to Bob');
    fireEvent.keyDown(input(), { key: 'Enter' });
    act(() => useUiStore.getState().setReplyTo(c.id, { ...replyTarget('ada'), id: 'm10' }));
    await act(async () => reject(new Error('Offline')));
    expect(input().value).toBe('');
    expect(useUiStore.getState().replyTo[c.id]?.id).toBe('m10');
    expect((screen.getByRole('button', { name: 'Restore failed message' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => useUiStore.getState().setReplyTo(c.id, null));
    fireEvent.click(screen.getByRole('button', { name: 'Restore failed message' }));
    expect(input().value).toBe('answer to Bob');
    expect(useUiStore.getState().replyTo[c.id]?.id).toBe('m9');
  });

  it('does not restore a late failure into another account', async () => {
    const c = dmChannel();
    useSessionStore.setState({ user: user(ME) } as never);
    let reject!: (error: Error) => void;
    send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    render(<Composer channel={c} mode="standard" />);
    type('private account draft');
    fireEvent.keyDown(input(), { key: 'Enter' });
    act(() => useSessionStore.setState({ user: user('other') } as never));
    await act(async () => reject(new Error('Offline')));
    expect(input().value).toBe('');
    expect(screen.queryByRole('button', { name: 'Restore failed message' })).toBeNull();
  });

  it('retains a failure after its channel composer unmounts', async () => {
    const c = dmChannel();
    useSessionStore.setState({ user: user(ME) } as never);
    let reject!: (error: Error) => void;
    send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const view = render(<Composer channel={c} mode="standard" />);
    type('send before navigation');
    fireEvent.keyDown(input(), { key: 'Enter' });
    view.unmount();
    await act(async () => reject(new Error('Offline')));
    render(<Composer channel={c} mode="standard" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore failed message' }));
    expect(input().value).toBe('send before navigation');
  });

  it('keeps explicit mention tokens when retrying a ping-off reply', async () => {
    const c = dmChannel();
    useSessionStore.setState({ user: user(ME) } as never);
    useUiStore.setState({ replyTo: { [c.id]: replyTarget('bob') } } as never);
    useReplyPingStore.setState({ ping: false });
    send.mockRejectedValueOnce(new Error('Offline'));
    render(<Composer channel={c} mode="standard" />);
    act(() => useMentionStore.getState().requestMention(c.id, 'Ada', '123'));
    type(`${input().value}answer`);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ content: '<@123> answer', pingReplied: false }));
    await waitFor(() => expect(input().value).toBe('@Ada answer'));
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ content: '<@123> answer', replyTo: 'm9', pingReplied: false }));
  });
});

describe('Composer: character counter', () => {
  it('is hidden far from the limit, shown near it and red over it', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    type('x'.repeat(100));
    expect(screen.queryByRole('status')).toBeNull();
    type('x'.repeat(1900));
    expect(screen.getByRole('status').textContent).toBe('100');
    type('x'.repeat(2003));
    const counter = screen.getByRole('status');
    expect(counter.textContent).toBe('-3');
    expect(counter.className).toContain('is-over');
  });

  it('blocks sending over 2000 characters', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    type('x'.repeat(2001));
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Send message/) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Composer: emoji autocomplete', () => {
  it('suggests unicode emoji for :ra and Tab inserts one', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    type(':rainb');
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]!.textContent).toContain(':rainbow:');
    fireEvent.keyDown(input(), { key: 'Tab' });
    expect(input().value).toBe('🌈 ');
  });

  it('suggests server emoji too', () => {
    const c = guildChannel();
    seedGuild(BASE, c);
    useGuildStore.setState((s) => ({ guilds: { ...s.guilds, [G]: { ...s.guilds[G]!, emojis: [{ id: '99', name: 'rainbowdash', animated: false }] } } }) as never);
    render(<Composer channel={c} mode="standard" />);
    type(':rainb');
    expect(screen.getAllByRole('option')[0]!.textContent).toContain(':rainbowdash:');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input().value).toBe('<:rainbowdash:99> ');
  });

  it('does not suggest for a single character', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    type(':r');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

describe('Composer: slowmode', () => {
  it('blocks sending and shows a countdown, then frees up', () => {
    vi.useFakeTimers();
    const c = guildChannel({ rate_limit_per_user: 5 });
    seedGuild(BASE, c);
    useSlowmodeStore.setState({ lastSent: { c1: Date.now() } });
    render(<Composer channel={c} mode="standard" />);
    type('hi');
    expect(screen.getByRole('timer').textContent).toContain('5s');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Slowmode: wait/) as HTMLButtonElement).disabled).toBe(true);
    act(() => void vi.advanceTimersByTime(5500));
    expect(screen.queryByRole('timer')).toBeNull();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('starts the cooldown after a send', () => {
    const c = guildChannel({ rate_limit_per_user: 10 });
    seedGuild(BASE, c);
    render(<Composer channel={c} mode="standard" />);
    type('hi');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('timer')).toBeTruthy();
  });

  it('is bypassed with MANAGE_MESSAGES', () => {
    const c = guildChannel({ rate_limit_per_user: 10 });
    seedGuild(BASE | Permission.MANAGE_MESSAGES, c);
    useSlowmodeStore.setState({ lastSent: { c1: Date.now() } });
    render(<Composer channel={c} mode="standard" />);
    expect(screen.queryByRole('timer')).toBeNull();
    type('hi');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is bypassed with MANAGE_CHANNELS', () => {
    const c = guildChannel({ rate_limit_per_user: 10 });
    seedGuild(BASE | Permission.MANAGE_CHANNELS, c);
    useSlowmodeStore.setState({ lastSent: { c1: Date.now() } });
    render(<Composer channel={c} mode="standard" />);
    expect(screen.queryByRole('timer')).toBeNull();
  });
});

describe('Composer: drafts', () => {
  it('restores the draft when the channel is shown again', () => {
    vi.useFakeTimers();
    const a = dmChannel();
    const view = render(<Composer channel={a} mode="standard" />);
    type('unfinished thought');
    view.unmount();
    expect(useDraftStore.getState().drafts[a.id]?.text).toBe('unfinished thought');
    render(<Composer channel={a} mode="standard" />);
    expect(input().value).toBe('unfinished thought');
  });

  it('keeps drafts separate per channel', () => {
    const a = dmChannel();
    const b = { ...dmChannel(), id: 'dm2' } as Channel;
    const view = render(<Composer channel={a} mode="standard" />);
    type('for a');
    view.rerender(<Composer channel={b} mode="standard" />);
    expect(input().value).toBe('');
    type('for b');
    view.rerender(<Composer channel={a} mode="standard" />);
    expect(input().value).toBe('for a');
  });

  it('persists the reply target with the draft', () => {
    const a = dmChannel();
    const target = { id: 'm9', channel_id: a.id, author: user('bob'), content: 'original' } as unknown as Message;
    useDraftStore.setState({ drafts: { [a.id]: { text: 'answer', replyTo: target as never, updatedAt: 1 } } });
    render(<Composer channel={a} mode="standard" />);
    expect(useUiStore.getState().replyTo[a.id]?.id).toBe('m9');
    expect(screen.getByText('original')).toBeTruthy();
  });

  it('clears the draft once the message is sent', () => {
    vi.useFakeTimers();
    const a = dmChannel();
    render(<Composer channel={a} mode="standard" />);
    type('bye');
    act(() => void vi.advanceTimersByTime(400));
    expect(useDraftStore.getState().drafts[a.id]?.text).toBe('bye');
    fireEvent.keyDown(input(), { key: 'Enter' });
    act(() => void vi.advanceTimersByTime(400));
    expect(useDraftStore.getState().drafts[a.id]).toBeUndefined();
  });

  it('never persists drafts for private delivery modes', () => {
    vi.useFakeTimers();
    const a = dmChannel();
    const view = render(<Composer channel={a} mode="ephemeral" />);
    type('secret');
    act(() => void vi.advanceTimersByTime(400));
    view.unmount();
    expect(useDraftStore.getState().drafts[a.id]).toBeUndefined();
  });
});

describe('Composer: edit last message and Escape', () => {
  const msg = (id: string, author: string, extra: Partial<Message> = {}) =>
    ({ id, channel_id: 'dm1', author: user(author), content: id, timestamp: '2026-01-01T00:00:00Z', edited_timestamp: null, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], pinned: false, type: 0, ...extra }) as Message;

  it('ArrowUp in an empty input edits the last own message', () => {
    useSessionStore.setState({ user: user(ME) } as never);
    useMessageStore.getState().setHistory('dm1', [msg('1', ME), msg('2', 'bob'), msg('3', ME), msg('4', 'bob')], { prepend: false, hasMoreBefore: false });
    render(<Composer channel={dmChannel()} mode="standard" />);
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(useUiStore.getState().editing).toEqual({ channelId: 'dm1', messageId: '3' });
  });

  it('ignores ArrowUp when there is text, and skips unsent or system messages', () => {
    useSessionStore.setState({ user: user(ME) } as never);
    useMessageStore.getState().setHistory('dm1', [msg('1', ME), msg('2', ME, { type: 7 }), msg('3', ME, { localState: 'sending' } as never)], { prepend: false, hasMoreBefore: false });
    render(<Composer channel={dmChannel()} mode="standard" />);
    type('draft');
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(useUiStore.getState().editing).toBeNull();
    type('');
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(useUiStore.getState().editing?.messageId).toBe('1');
  });

  it('does nothing without an own message', () => {
    useSessionStore.setState({ user: user(ME) } as never);
    render(<Composer channel={dmChannel()} mode="standard" />);
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(useUiStore.getState().editing).toBeNull();
  });

  it('Escape cancels an edit, then a reply', () => {
    const c = dmChannel();
    render(<Composer channel={c} mode="standard" />);
    act(() => useUiStore.setState({ editing: { channelId: c.id, messageId: '3' }, replyTo: { [c.id]: msg('9', 'bob') } } as never));
    expect(fireEvent.keyDown(input(), { key: 'Escape' })).toBe(false);
    expect(useUiStore.getState().editing).toBeNull();
    expect(useUiStore.getState().replyTo[c.id]).not.toBeNull();
    expect(fireEvent.keyDown(input(), { key: 'Escape' })).toBe(false);
    expect(useUiStore.getState().replyTo[c.id]).toBeNull();
  });
});

describe('Composer: paste limits', () => {
  it('offers Convert to file or Send as message for a pasted wall of text', () => {
    const c = guildChannel();
    seedGuild(BASE, c);
    render(<Composer channel={c} mode="standard" />);
    const long = 'x'.repeat(2500);
    fireEvent.paste(input(), { clipboardData: { files: [], getData: () => long } });
    expect(input().value).toBe('');
    expect(screen.queryByText('message.txt')).toBeNull();
    fireEvent.click(screen.getByText('Convert to file'));
    expect(screen.getByText('message.txt')).toBeTruthy();
    expect(input().value).toBe('');
  });

  it('Send as message puts the text in the input', () => {
    const c = guildChannel();
    seedGuild(BASE, c);
    render(<Composer channel={c} mode="standard" />);
    const long = 'y'.repeat(2500);
    fireEvent.paste(input(), { clipboardData: { files: [], getData: () => long } });
    fireEvent.click(screen.getByText('Send as message'));
    expect(input().value).toBe(long);
    expect(screen.queryByText('message.txt')).toBeNull();
  });

  it('lets short pastes through as text', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    fireEvent.paste(input(), { clipboardData: { files: [], getData: () => 'short' } });
    expect(screen.queryByText('message.txt')).toBeNull();
  });

  it('refuses attachments beyond 10 files with a toast', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    const files = Array.from({ length: 12 }, (_, i) => new File(['a'], `f${i}.txt`));
    fireEvent.paste(input(), { clipboardData: { files, getData: () => '' } });
    expect(screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('.txt'))).toHaveLength(10);
    expect(useUiStore.getState().toasts.some((t) => t.body?.includes('at most 10'))).toBe(true);
  });
});

describe('Composer: send key preference, @here and format toolbar', () => {
  afterEach(() => usePrefsStore.setState({ sendWithCtrlEnter: false } as never));

  it('with Send with Ctrl+Enter on, Enter does not send but Ctrl+Enter does', () => {
    usePrefsStore.setState({ sendWithCtrlEnter: true } as never);
    render(<Composer channel={dmChannel()} mode="standard" />);
    type('hello');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: 'Enter', ctrlKey: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('suggests @here next to @everyone with MENTION_EVERYONE', () => {
    const c = guildChannel();
    seedGuild(BASE | Permission.MENTION_EVERYONE, c);
    render(<Composer channel={c} mode="standard" />);
    type('@he');
    fireEvent.keyDown(input(), { key: 'Tab' });
    expect(input().value).toBe('@here ');
  });

  it('shows the format toolbar on a selection and wraps it', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    type('hello');
    expect(screen.queryByRole('toolbar')).toBeNull();
    input().setSelectionRange(0, 5);
    fireEvent.select(input());
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(input().value).toBe('**hello**');
  });

  it('the plus menu offers Upload a file only', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to message' }));
    expect(screen.getByRole('menuitem', { name: /Upload a file/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /poll/i })).toBeNull();
  });
});

describe('Composer: timestamp picker', () => {
  const unixOf = (d: Date) => Math.floor(d.getTime() / 1000);

  function pick(date: string, time: string, format?: string) {
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: time } });
    if (format) fireEvent.change(screen.getByLabelText('Format'), { target: { value: format } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
  }

  it('opens from @time, removes the trigger and inserts the chosen timestamp', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    type('see you @time');
    expect(screen.getByRole('option', { name: /time/ })).toBeTruthy();
    fireEvent.keyDown(input(), { key: 'Tab' });
    expect(input().value).toBe('see you ');
    pick('2026-11-04', '18:30', 'R');
    expect(input().value).toBe(`see you <t:${unixOf(new Date(2026, 10, 4, 18, 30))}:R> `);
  });

  it('opens from the composer button and defaults to the short date and time format', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert timestamp' }));
    pick('2026-11-04', '09:05');
    expect(input().value).toBe(`<t:${unixOf(new Date(2026, 10, 4, 9, 5))}:f> `);
  });

  it('cannot insert while the date is incomplete', () => {
    render(<Composer channel={dmChannel()} mode="standard" />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert timestamp' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    expect((screen.getByRole('button', { name: 'Insert' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
