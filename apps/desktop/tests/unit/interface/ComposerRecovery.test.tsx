// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useDraftStore } from '@discordy/core/application/stores/composerStores';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import type { Channel } from '@discordy/core/contracts/rest';
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ privacy: { sender: { send } }, api: { typing: async () => undefined }, interactions: {} }) }));
vi.mock('@renderer/interface/features/privacy/ModeSwitcher', () => ({ ModeSwitcher: () => null }));
vi.mock('@renderer/interface/features/privacy/PeerStatus', () => ({ PeerStatus: () => null }));
import { Composer } from '@renderer/interface/features/chat/Composer';
const channel = { id: 'dm1', type: 1, recipients: [{ id: 'bob', username: 'bob' }], delivery_mode: 'standard' } as Channel;
const input = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const type = (value: string) => fireEvent.change(input(), { target: { value, selectionStart: value.length } });
const mount = () => render(<Composer channel={channel} mode="standard" />);
let rejectSend: (error: Error) => void;
beforeEach(() => {
  send.mockReset(); send.mockImplementation(() => new Promise((_, reject) => { rejectSend = reject; }));
  useSessionStore.setState({ user: { id: 'me', username: 'me', global_name: null, avatar: null }, status: 'ready' } as never);
  useGuildStore.setState({ channels: { dm1: channel } });
  useDraftStore.setState({ drafts: {} }); useUiStore.setState({ replyTo: {}, editing: null, toasts: [] });
  useConnectionStore.getState().set({ apiUrl: 'https://synthetic.test', gatewayUrl: '', cdnUrl: '' });
});
afterEach(() => cleanup());
it.each(['before', 'after'])('recovers a complete failed draft when remounted %s rejection', async (when) => {
  const view = mount(); type('old text');
  const file = new File(['x'], 'draft.txt', { type: 'text/plain' });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.keyDown(input(), { key: 'Enter' }); view.unmount();
  if (when === 'before') mount();
  await act(async () => rejectSend(new Error('Offline')));
  if (when === 'after') mount();
  expect(input().value).toBe('old text'); expect(screen.getByText('draft.txt')).toBeTruthy();
});
it('does not overwrite a newer live draft on late failure', async () => {
  const view = mount(); type('old'); fireEvent.keyDown(input(), { key: 'Enter' }); view.unmount(); mount(); type('new');
  await act(async () => rejectSend(new Error('Offline'))); expect(input().value).toBe('new');
});
it('discards a late failure after runtime replacement', async () => {
  mount(); type('old'); fireEvent.keyDown(input(), { key: 'Enter' });
  act(() => useConnectionStore.getState().set({ apiUrl: 'https://synthetic.test', gatewayUrl: '', cdnUrl: '' }));
  await act(async () => rejectSend(new Error('Offline'))); expect(input().value).toBe('');
  expect(useUiStore.getState().toasts).toHaveLength(0);
});
