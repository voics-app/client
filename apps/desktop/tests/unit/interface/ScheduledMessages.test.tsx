// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, installDeviceStorage } from '@discordy/core/application/ports/deviceStorage';
import { useDraftStore } from '@discordy/core/application/stores/composerStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import type { Channel, User } from '@discordy/core/contracts/rest';
import type { ScheduledMessage } from '@discordy/core/contracts/scheduledMessages';
import { localScheduleInput } from '@discordy/core/domain/scheduledMessages';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import { ScheduledMessagesDialog, type ScheduledMessagesDialogProps } from '@renderer/interface/features/scheduling/ScheduledMessagesDialog';
import { Composer } from '@renderer/interface/features/chat/Composer';

const api = { createScheduledMessage: vi.fn(), scheduledMessages: vi.fn(), scheduledMessage: vi.fn(), editScheduledMessage: vi.fn(), cancelScheduledMessage: vi.fn(), typing: vi.fn() };
const send = vi.fn();
const navigate = vi.fn();
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api, privacy: { sender: { send } }, interactions: {} }) }));
vi.mock('@renderer/interface/app/navigation', () => ({ openChannel: (...args: unknown[]) => navigate(...args) }));
vi.mock('@renderer/interface/features/privacy/ModeSwitcher', () => ({ ModeSwitcher: () => null }));
vi.mock('@renderer/interface/features/privacy/PeerStatus', () => ({ PeerStatus: () => null }));

const id = '12345678-1234-4123-8123-123456789abc';
const now = Date.now();
const due = new Date(now + 3_600_000).toISOString();
const resource = (patch: Partial<ScheduledMessage> = {}): ScheduledMessage => ({ id, channel_id: '10', author_id: '7', revision: 1, status: 'pending', scheduled_at: due, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), message: { content: 'Original message' }, message_id: null, failure: null, ...patch });
const user = (userId = '7') => ({ id: userId, username: 'scheduler', global_name: null, avatar: null }) as User;
const props = (patch: Partial<ScheduledMessagesDialogProps> = {}): ScheduledMessagesDialogProps => ({ channelId: '10', mode: 'standard', initial: 'list', draft: { content: 'Composer draft' }, source: { text: 'Composer draft', replyTo: null }, createDisabledReason: null, canSend: true, canTts: true, onAccepted: vi.fn(), onClose: vi.fn(), ...patch });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
  installDeviceStorage(createMemoryStorage());
  useSessionStore.setState({ user: user() });
  useConnectionStore.setState({ apiUrl: 'https://api.test' });
  useUiStore.setState({ replyTo: {}, editing: null, toasts: [] });
  useDraftStore.setState({ drafts: {} });
  api.scheduledMessages.mockResolvedValue({ items: [], next_after: null });
  api.scheduledMessage.mockResolvedValue(resource());
  api.createScheduledMessage.mockImplementation(async (_channel, request) => resource({ id: request.request_id, scheduled_at: request.scheduled_at, message: request.message }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('desktop scheduled-message composer', () => {
  it('schedules the composer text and clears it only after acknowledgment, preserving reply and silent options', async () => {
    const channel = { id: '10', type: 1, delivery_mode: 'standard', recipients: [user('8')] } as Channel;
    useUiStore.setState({ replyTo: { '10': { id: '44', author: user('8') } } } as never);
    render(<Composer channel={channel} mode="standard" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '@silent Later today', selectionStart: 19 } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to message' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Send later' }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Later today');
    expect(within(dialog).getByText(/Local time/).textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    let accept!: (item: ScheduledMessage) => void;
    api.createScheduledMessage.mockReturnValueOnce(new Promise<ScheduledMessage>((resolve) => { accept = resolve; }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schedule message' }));
    await waitFor(() => expect(api.createScheduledMessage).toHaveBeenCalledTimes(1));
    expect((screen.getAllByRole('textbox')[0] as HTMLTextAreaElement).value).toBe('@silent Later today');
    expect(api.createScheduledMessage.mock.calls[0]?.[1]).toMatchObject({ request_id: id, message: { content: 'Later today', silent: true, reply_to: '44', replied_user: true } });
    await act(async () => accept(resource({ message: { content: 'Later today' } })));
    await screen.findByText('Scheduled');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
    expect(useUiStore.getState().replyTo['10']).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('reuses the persisted original body after dismissal and past its due time without replacing the current composer draft', async () => {
    const accepted = vi.fn();
    api.createScheduledMessage.mockRejectedValueOnce(Object.assign(new Error('Service unavailable'), { status: 503 }));
    const first = render(<ScheduledMessagesDialog {...props({ initial: 'create', draft: { content: 'Original', tts: true, silent: true, reply_to: '44', replied_user: false }, onAccepted: accepted })} />);
    fireEvent.change(screen.getByLabelText('Send on'), { target: { value: localScheduleInput(due) } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule message' }));
    await screen.findByRole('button', { name: 'Retry confirmation' });
    expect(accepted).not.toHaveBeenCalled();
    const original = api.createScheduledMessage.mock.calls[0];
    first.unmount();
    vi.spyOn(Date, 'now').mockReturnValue(now + 7_200_000);
    api.createScheduledMessage.mockResolvedValueOnce(resource({ status: 'sent', revision: 3, message: null, message_id: '99' }));
    render(<ScheduledMessagesDialog {...props({ initial: 'create', draft: { content: 'New unrelated text' }, source: { text: 'New unrelated text', replyTo: null }, onAccepted: accepted })} />);
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Original');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry confirmation' }));
    await screen.findByText('Sent');
    expect(api.createScheduledMessage.mock.calls[1]).toEqual(original);
    expect(accepted).toHaveBeenCalledWith({ text: 'Composer draft', replyTo: null });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('leaves an edited form intact on a revision conflict and requires explicit review before another PATCH', async () => {
    api.scheduledMessages.mockResolvedValue({ items: [resource()], next_after: null });
    api.editScheduledMessage.mockRejectedValueOnce(Object.assign(new Error('Revision changed'), { status: 409 }));
    api.scheduledMessage.mockResolvedValueOnce(resource()).mockResolvedValue(resource({ revision: 2, message: { content: 'Other device' } }));
    render(<ScheduledMessagesDialog {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(api.scheduledMessage).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'My local edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('button', { name: 'Load latest version' });
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('My local edit');
    expect(api.editScheduledMessage).toHaveBeenCalledExactlyOnceWith('10', id, { expected_revision: 1, message: { content: 'My local edit', tts: false, silent: false, replied_user: true, reply_to: null } });
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Load latest version' }));
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Other device');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Reviewed change' } });
    api.editScheduledMessage.mockResolvedValueOnce(resource({ revision: 3, message: { content: 'Reviewed change' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.editScheduledMessage).toHaveBeenCalledTimes(2));
    expect(api.editScheduledMessage.mock.calls[1]?.[2].expected_revision).toBe(2);
  });

  it('refreshes an open editor on window focus without overwriting local edits', async () => {
    api.scheduledMessages.mockResolvedValue({ items: [resource()], next_after: null });
    render(<ScheduledMessagesDialog {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(api.scheduledMessage).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Unsaved local text' } });
    api.scheduledMessage.mockResolvedValueOnce(resource({ status: 'dispatching', revision: 2, message_id: '99' }));
    fireEvent.focus(window);
    await screen.findByRole('region', { name: 'Latest version' });
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Unsaved local text');
    expect(screen.queryByRole('button', { name: 'Load latest version' })).toBeNull();
    expect(api.editScheduledMessage).not.toHaveBeenCalled();
  });
});

describe('desktop scheduled-message list', () => {
  it('follows an empty cursor page and allows author cancellation after losing send permission', async () => {
    api.scheduledMessages.mockResolvedValueOnce({ items: [], next_after: id }).mockResolvedValue({ items: [resource()], next_after: null });
    api.cancelScheduledMessage.mockResolvedValue(resource({ status: 'cancelled', revision: 2, message: null }));
    render(<ScheduledMessagesDialog {...props({ canSend: false, createDisabledReason: 'You do not have permission to send messages here.' })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel message' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirm cancellation' })).getByRole('button', { name: 'Cancel message' }));
    await screen.findByText('Cancelled');
    expect(api.scheduledMessages).toHaveBeenCalledWith('10', { limit: 50, after: id });
    expect(api.cancelScheduledMessage).toHaveBeenCalledExactlyOnceWith('10', id, 1);
    expect(screen.queryByText('Original message')).toBeNull();
  });

  it('shows every wire state and gives uncertain delivery only an inspect action, never a resend or claimed message jump', async () => {
    const states: ScheduledMessage['status'][] = ['pending', 'dispatching', 'sent', 'failed', 'cancelled', 'delivery_unknown'];
    api.scheduledMessages.mockResolvedValue({ items: states.map((status, index) => resource({ id: `${id.slice(0, -1)}${index}`, status, message: status === 'pending' || status === 'dispatching' ? { content: status } : null, message_id: ['sent', 'dispatching', 'delivery_unknown'].includes(status) ? '99' : null, failure: status === 'delivery_unknown' ? 'delivery_unknown' : status === 'failed' ? 'access_denied' : null })), next_after: null });
    const jump = vi.spyOn(useReadNavStore.getState(), 'requestJump');
    render(<ScheduledMessagesDialog {...props()} />);
    for (const label of ['Scheduled', 'Sending', 'Sent', 'Not sent', 'Cancelled', 'Delivery could not be confirmed']) expect(await screen.findByText(label)).toBeTruthy();
    const unknown = screen.getByText('Delivery could not be confirmed').closest('li')!;
    expect(within(unknown).getAllByRole('button').map((button) => button.textContent)).toEqual(['Inspect channel']);
    fireEvent.click(within(unknown).getByRole('button', { name: 'Inspect channel' }));
    expect(navigate).toHaveBeenCalledWith('10');
    expect(jump).not.toHaveBeenCalled();
    expect(api.createScheduledMessage).not.toHaveBeenCalled();
  });

  it('does not submit a new private draft', () => {
    render(<ScheduledMessagesDialog {...props({ initial: 'create', mode: 'p2p' })} />);
    expect(screen.getByRole('alert').textContent).toContain('only in Standard');
    fireEvent.submit(screen.getByRole('button', { name: 'Schedule message' }).closest('form')!);
    expect(api.createScheduledMessage).not.toHaveBeenCalled();
  });

  it('refreshes a cancellation race without claiming success or retrying against the newer revision', async () => {
    api.scheduledMessages.mockResolvedValue({ items: [resource()], next_after: null });
    api.cancelScheduledMessage.mockRejectedValue(Object.assign(new Error('Already dispatching'), { status: 409 }));
    api.scheduledMessage.mockResolvedValue(resource({ revision: 2, status: 'dispatching', message_id: '99' }));
    render(<ScheduledMessagesDialog {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel message' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirm cancellation' })).getByRole('button', { name: 'Cancel message' }));
    await screen.findByText('Sending');
    expect(screen.getByRole('alert').textContent).toContain('Could not cancel');
    expect(screen.queryByText('Cancelled')).toBeNull();
    expect(api.cancelScheduledMessage).toHaveBeenCalledExactlyOnceWith('10', id, 1);
    expect(screen.queryByRole('button', { name: 'Cancel message' })).toBeNull();
  });

  it('does not show or retry another account’s uncertain create after switching accounts', async () => {
    api.createScheduledMessage.mockRejectedValueOnce(new Error('Connection lost'));
    render(<ScheduledMessagesDialog {...props({ initial: 'create' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule message' }));
    await screen.findByRole('button', { name: 'Retry confirmation' });
    await act(async () => useSessionStore.setState({ user: user('8') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry confirmation' })).toBeNull();
    expect(api.createScheduledMessage).toHaveBeenCalledTimes(1);
  });
});
