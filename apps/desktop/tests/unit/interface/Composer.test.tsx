// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMessageStore } from '@renderer/application/stores/messageStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useDraftStore, useSlowmodeStore } from '@renderer/application/stores/composerStores';
import { Permission } from '@shared/contracts/permissions';
import type { Channel, Message, User } from '@shared/contracts/rest';

const send = vi.fn(async () => null);
vi.mock('@renderer/interface/app/runtime', () => ({
  getRuntime: () => ({ privacy: { sender: { send } }, api: { typing: async () => undefined }, interactions: {} }),
}));
vi.mock('@renderer/interface/features/privacy/ModeSwitcher', () => ({ ModeSwitcher: () => null }));
vi.mock('@renderer/interface/features/privacy/PeerStatus', () => ({ PeerStatus: () => null }));

import { Composer } from '@renderer/interface/features/chat/Composer';

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
  send.mockClear();
  useDraftStore.setState({ drafts: {} });
  useSlowmodeStore.setState({ lastSent: {} });
  useUiStore.setState({ replyTo: {}, editing: null, toasts: [] } as never);
  useMessageStore.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Composer: sending and newlines', () => {
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
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(useUiStore.getState().editing).toBeNull();
    expect(useUiStore.getState().replyTo[c.id]).not.toBeNull();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(useUiStore.getState().replyTo[c.id]).toBeNull();
  });
});

describe('Composer: paste limits', () => {
  it('turns a pasted wall of text into message.txt', () => {
    const c = guildChannel();
    seedGuild(BASE, c);
    render(<Composer channel={c} mode="standard" />);
    const long = 'x'.repeat(2500);
    fireEvent.paste(input(), { clipboardData: { files: [], getData: () => long } });
    expect(screen.getByText('message.txt')).toBeTruthy();
    expect(input().value).toBe('');
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
