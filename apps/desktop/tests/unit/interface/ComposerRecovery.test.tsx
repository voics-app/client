// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useMentionStore } from '@discordy/core/application/stores/mentionStore';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useDraftStore, useReplyPingStore, useSlowmodeStore } from '@discordy/core/application/stores/composerStores';
import { confirmAgeRestrictedChannel, initialiseAgeRestrictedAccess } from '@discordy/core/application/ageRestrictedAccess';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Channel } from '@discordy/core/contracts/rest';

const { send, speak } = vi.hoisted(() => ({ send: vi.fn(), speak: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ privacy: { sender: { send } }, api: { typing: async () => undefined }, interactions: {} }) }));
vi.mock('@renderer/interface/features/privacy/ModeSwitcher', () => ({ ModeSwitcher: () => null }));
vi.mock('@renderer/interface/features/privacy/PeerStatus', () => ({ PeerStatus: () => null }));
vi.mock('@renderer/infrastructure/tts', () => ({ speak }));

import { Composer } from '@renderer/interface/features/chat/Composer';
import { AgeRestrictedGate } from '@renderer/interface/features/channels/AgeRestrictedGate';
import { LocaleProvider } from '@renderer/interface/shared/i18n';

const channel: Channel = { id: 'c1', guild_id: 'g1', type: 0, name: 'adult', nsfw: true, delivery_mode: 'standard' };
const me = { id: 'me', username: 'me', global_name: null, avatar: null };
const perms = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.SEND_TTS_MESSAGES | Permission.ATTACH_FILES;
const input = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const hide = (value: boolean) => act(() => useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: value } }));

beforeEach(() => {
  vi.clearAllMocks();
  useGuildStore.getState().reset();
  useSessionStore.getState().reset();
  useDraftStore.setState({ drafts: {} });
  useSlowmodeStore.setState({ lastSent: {} });
  useReplyPingStore.setState({ ping: false });
  useMentionStore.setState({ request: null });
  useConnectionStore.getState().set({ apiUrl: 'https://synthetic-review.test', gatewayUrl: '', cdnUrl: '' });
  useUiStore.setState({ replyTo: {}, editing: null, toasts: [] });
  initialiseAgeRestrictedAccess('https://synthetic-review.test');
  useSessionStore.setState({ user: me, status: 'ready', settings: { default_delivery_mode: 'standard', locale: 'en-US' } });
  usePrefsStore.setState({ ttsReadAloud: true, convertEmoticons: false });
  useGuildStore.setState({
    channels: { c1: channel },
    guilds: { g1: { id: 'g1', name: 'review', owner_id: 'owner', roles: [{ id: 'g1', name: '@everyone', permissions: perms.toString() }], emojis: [] } } as never,
    members: { g1: { me: { user: me, roles: [] } } } as never,
  });
  expect(confirmAgeRestrictedChannel(channel.id)).toBe(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function mount() {
  return render(<LocaleProvider><AgeRestrictedGate channelId={channel.id}><Composer channel={channel} mode="standard" /></AgeRestrictedGate></LocaleProvider>);
}

function mountAndSend(text: string) {
  mount();
  fireEvent.change(input(), { target: { value: text, selectionStart: text.length } });
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(send).toHaveBeenCalledTimes(1);
}

it('does not enqueue own TTS after the channel has been hidden during send', async () => {
  let resolve!: (value: null) => void;
  send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  mountAndSend('/tts hidden-content');
  hide(true);
  expect(screen.queryByRole('textbox')).toBeNull();
  await act(async () => resolve(null));
  expect(speak).not.toHaveBeenCalled();
});

it('restores failed send text with its reply after a hide and reconfirmation', async () => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  useUiStore.getState().setReplyTo(channel.id, { id: 'reply1', channel_id: channel.id, author: { id: 'bob', username: 'bob', global_name: null, avatar: null }, content: 'original' } as never);
  mountAndSend('@silent answer');
  hide(true);
  await act(async () => reject(new Error('Offline')));
  hide(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(useUiStore.getState().replyTo[channel.id]?.id).toBe('reply1');
  expect(input().value).toBe('@silent answer');
});

it.each(['before rejection', 'after rejection'])('restores the full retry into a composer remounted %s', async (when) => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  useUiStore.getState().setReplyTo(channel.id, { id: 'reply1', channel_id: channel.id, author: { id: 'bob', username: 'bob', global_name: null, avatar: null }, content: 'original' } as never);
  mount();
  fireEvent.change(input(), { target: { value: '@silent ', selectionStart: 8 } });
  act(() => useMentionStore.getState().requestMention(channel.id, 'Ada', '123'));
  fireEvent.change(input(), { target: { value: `${input().value}answer`, selectionStart: input().value.length + 6 } });
  const raw = input().value;
  const file = new File(['draft file'], 'notes.txt', { type: 'text/plain' });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /Edit description.*notes.txt/ }));
  fireEvent.change(screen.getByRole('textbox', { name: /Description.*notes.txt/ }), { target: { value: 'File description' } });
  fireEvent.keyDown(screen.getByRole('textbox', { name: /Description.*notes.txt/ }), { key: 'Escape' });
  fireEvent.keyDown(input(), { key: 'Enter' });
  const original = send.mock.calls[0]?.[1];
  hide(true);
  const reconfirm = () => { hide(false); fireEvent.click(screen.getByRole('button', { name: 'Continue' })); };
  if (when === 'before rejection') reconfirm();
  await act(async () => reject(new Error('Offline')));
  if (when === 'after rejection') reconfirm();
  expect(input().value).toBe(raw);
  expect(screen.getByText('notes.txt')).toBeTruthy();
  expect(useUiStore.getState().replyTo[channel.id]?.id).toBe('reply1');
  // A second restriction change must not strip the restored files or mention identities.
  hide(true);
  reconfirm();
  expect(input().value).toBe(raw);
  expect(screen.getByText('notes.txt')).toBeTruthy();
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(send.mock.calls[1]?.[1]).toEqual(original);
  expect(send.mock.calls[1]?.[1]).toMatchObject({ content: '<@123> answer', silent: true, pingReplied: false, replyTo: 'reply1', files: [file], fileOptions: [{ description: 'File description' }] });
});

it('never overwrites a newer remounted draft inside the persistence debounce window', async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mountAndSend('@silent old answer');
  hide(true);
  hide(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(input(), { target: { value: 'New live text' } });
  expect(useDraftStore.getState().drafts[channel.id]).toBeUndefined();
  await act(async () => reject(new Error('Offline')));
  expect(input().value).toBe('New live text');
  expect(useUiStore.getState().replyTo[channel.id]).toBeNull();
  const restore = screen.getByRole('button', { name: 'Restore failed message' }) as HTMLButtonElement;
  expect(restore.disabled).toBe(true);
  fireEvent.change(input(), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Restore failed message' }));
  expect(input().value).toBe('@silent old answer');
});

it('retains a failed reply separately when a newer reply is selected', async () => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const oldReply = { id: 'old-reply', channel_id: channel.id, author: { id: 'bob', username: 'bob', global_name: null, avatar: null }, content: 'old' };
  const newReply = { ...oldReply, id: 'new-reply', content: 'new' };
  useUiStore.getState().setReplyTo(channel.id, oldReply as never);
  mountAndSend('old answer');
  act(() => useUiStore.getState().setReplyTo(channel.id, newReply as never));
  await act(async () => reject(new Error('Offline')));
  expect(useUiStore.getState().replyTo[channel.id]?.id).toBe('new-reply');
  expect((screen.getByRole('button', { name: 'Restore failed message' }) as HTMLButtonElement).disabled).toBe(true);
  act(() => useUiStore.getState().setReplyTo(channel.id, null));
  fireEvent.click(screen.getByRole('button', { name: 'Restore failed message' }));
  expect(input().value).toBe('old answer');
  expect(useUiStore.getState().replyTo[channel.id]?.id).toBe('old-reply');
});

it('retains attachments and mention tokens beside a newer draft after the gate closes', async () => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mount();
  act(() => useMentionStore.getState().requestMention(channel.id, 'Ada', '123'));
  fireEvent.change(input(), { target: { value: `${input().value}old answer` } });
  const oldText = input().value;
  const file = new File(['draft'], 'retained.txt', { type: 'text/plain' });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.keyDown(input(), { key: 'Enter' });
  const original = send.mock.calls[0]?.[1];
  hide(true);
  hide(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(input(), { target: { value: 'new draft' } });
  await act(async () => reject(new Error('Offline')));
  expect(input().value).toBe('new draft');
  fireEvent.change(input(), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Restore failed message' }));
  expect(input().value).toBe(oldText);
  expect(screen.getByText('retained.txt')).toBeTruthy();
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(send.mock.calls[1]?.[1]).toEqual(original);
});

const changeOwner = {
  account: () => useSessionStore.getState().setUser({ ...me, id: 'other' }),
  session: () => useSessionStore.setState({ sessionId: 'new-session' }),
  logout: () => { useSessionStore.getState().reset(); useSessionStore.setState({ user: me, status: 'ready' }); },
  instance: () => initialiseAgeRestrictedAccess('https://other-instance.test'),
  runtime: () => useConnectionStore.getState().set({ apiUrl: 'https://synthetic-review.test', gatewayUrl: '', cdnUrl: '' }),
};

it.each(Object.entries(changeOwner))('clears a waiting failed draft when %s changes', async (_name, change) => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mountAndSend('Waiting recovery');
  hide(true);
  await act(async () => reject(new Error('Offline')));
  act(change);
  hide(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(input().value).toBe('');
  expect(useDraftStore.getState().drafts[channel.id]).toBeUndefined();
});

it('does not retain private-mode recovery after the original composer unmounts', async () => {
  const privateChannel = { ...channel, delivery_mode: 'ephemeral' as const };
  useGuildStore.getState().upsertChannel(privateChannel);
  confirmAgeRestrictedChannel(channel.id);
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(<LocaleProvider><AgeRestrictedGate channelId={channel.id}><Composer channel={privateChannel} mode="ephemeral" /></AgeRestrictedGate></LocaleProvider>);
  fireEvent.change(input(), { target: { value: 'Private draft' } });
  fireEvent.keyDown(input(), { key: 'Enter' });
  hide(true);
  await act(async () => reject(new Error('Offline')));
  hide(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(input().value).toBe('');
  expect(useDraftStore.getState().drafts[channel.id]).toBeUndefined();
});

it('expires an unclaimed in-memory failed draft without adding a disk draft', async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mountAndSend('Temporary recovery');
  hide(true);
  await act(async () => reject(new Error('Offline')));
  await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000 + 1));
  hide(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(input().value).toBe('');
  expect(useDraftStore.getState().drafts[channel.id]).toBeUndefined();
});

it('does not mix an old failure into new files selected after remount', async () => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mountAndSend('Old text');
  hide(true);
  hide(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  const file = new File(['new'], 'new.txt', { type: 'text/plain' });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await act(async () => reject(new Error('Offline')));
  expect(input().value).toBe('');
  expect(screen.getByText('new.txt')).toBeTruthy();
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(send.mock.calls[1]?.[1]).toMatchObject({ content: '', files: [file] });
});

it('does not resurrect an older failed attempt after a newer message has already sent', async () => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mountAndSend('First');
  fireEvent.change(input(), { target: { value: 'Second' } });
  fireEvent.keyDown(input(), { key: 'Enter' });
  await act(async () => undefined);
  await act(async () => reject(new Error('Late failure')));
  expect(input().value).toBe('');
  expect(send).toHaveBeenCalledTimes(2);
});

it.each(['removed', 'moved', 'private'])('does not play late TTS after its channel is %s', async (change) => {
  let resolve!: (value: null) => void;
  send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  mountAndSend('/tts old channel speech');
  act(() => {
    if (change === 'removed') useGuildStore.getState().removeChannel(channel.id);
    else useGuildStore.getState().upsertChannel({ ...channel, ...(change === 'moved' ? { guild_id: 'other-guild' } : { delivery_mode: 'ephemeral' as const }) });
  });
  await act(async () => resolve(null));
  expect(speak).not.toHaveBeenCalled();
});

it.each(Object.entries(changeOwner))('discards late failed recovery after %s changes', async (_name, change) => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mountAndSend('Old account text');
  hide(true);
  act(change);
  await act(async () => reject(new Error('Old account failure')));
  hide(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(input().value).toBe('');
  expect(useDraftStore.getState().drafts[channel.id]).toBeUndefined();
  expect(useUiStore.getState().toasts.some((toast) => toast.body === 'Old account failure')).toBe(false);
});

it.each(Object.entries(changeOwner))('does not play late TTS after %s changes', async (_name, change) => {
  let resolve!: (value: null) => void;
  send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  mountAndSend('/tts old speech');
  act(change);
  await act(async () => resolve(null));
  expect(speak).not.toHaveBeenCalled();
});

it('uses current TTS preference and still plays an accepted message for the unchanged owner', async () => {
  let resolve!: (value: null) => void;
  send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  mountAndSend('/tts no longer wanted');
  act(() => usePrefsStore.setState({ ttsReadAloud: false }));
  await act(async () => resolve(null));
  expect(speak).not.toHaveBeenCalled();
  act(() => usePrefsStore.setState({ ttsReadAloud: true }));
  fireEvent.change(input(), { target: { value: '/tts wanted' } });
  fireEvent.keyDown(input(), { key: 'Enter' });
  await act(async () => undefined);
  expect(speak).toHaveBeenCalledWith('wanted', 1);
});
