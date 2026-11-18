import { confirmAgeRestrictedChannel, initialiseAgeRestrictedAccess } from '@discordy/core/application/ageRestrictedAccess';
import { clearAgeRestrictedConfirmations } from '@discordy/core/application/stores/ageRestrictedStore';
import { useGuildStore, type GuildMeta } from '@discordy/core/application/stores/guildStore';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert, AppState } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createMemoryStorage, installDeviceStorage } from '@discordy/core/application/ports/deviceStorage';
import { useDraftStore } from '@discordy/core/application/stores/composerStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import type { ScheduledMessage } from '@discordy/core/contracts/scheduledMessages';
import type { User } from '@discordy/core/contracts/rest';
import { Composer, type ComposerProps } from '../../src/messages/Composer';
import { ScheduledMessagesSheet, type ScheduleOpening } from '../../src/scheduling/ScheduledMessagesSheet';
import { AgeRestrictedGate } from '../../src/safety/AgeRestrictedGate';

const mockApi = { createScheduledMessage: jest.fn(), scheduledMessages: jest.fn(), scheduledMessage: jest.fn(), editScheduledMessage: jest.fn(), cancelScheduledMessage: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ api: mockApi, apiUrl: 'https://api.test' }) }));
jest.mock('expo', () => ({ ...jest.requireActual('expo'), uuid: { v4: () => '12345678-1234-4123-8123-123456789abc' } }));
const id = '12345678-1234-4123-8123-123456789abc';
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
const context = { channelId: '10', mode: 'standard' as const, canTts: true };
const resource = (patch: Partial<ScheduledMessage> = {}): ScheduledMessage => ({ id, channel_id: '10', author_id: '7', revision: 1, status: 'pending', scheduled_at: new Date(Date.now() + 3_600_000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), message: { content: 'Original message' }, message_id: null, failure: null, ...patch });
const request = (initial: ScheduleOpening['initial'] = 'list'): ScheduleOpening => ({ initial, draft: { content: 'Composer draft' }, source: { text: 'Composer draft', replyTo: null }, createDisabledReason: null });
const mountComposer = (patch: Partial<ComposerProps> = {}) => render(wrap(<Composer mode={{ kind: 'compose' }} blockedReason={null} placeholder="Message #general" canAttach draftKey="10" scheduling={context} onSubmit={jest.fn()} onCancelMode={jest.fn()} {...patch} />));
const mountSheet = (initial: ScheduleOpening['initial'] = 'list') => render(wrap(<ScheduledMessagesSheet request={request(initial)} context={context} canSend onAccepted={jest.fn()} onClose={jest.fn()} />));

beforeEach(() => {
  jest.clearAllMocks();
  for (const method of Object.values(mockApi)) method.mockReset();
  installDeviceStorage(createMemoryStorage());
  useSessionStore.setState({ user: { id: '7', username: 'scheduler', global_name: null, avatar: null } as User });
  useGuildStore.getState().reset();
  initialiseAgeRestrictedAccess('https://api.test');
  useSessionStore.setState({ status: 'ready', settings: { default_delivery_mode: 'standard' } });
  useGuildStore.getState().upsertChannel({ id: '10', type: 1, delivery_mode: 'standard' });
  useDraftStore.setState({ drafts: {} });
  mockApi.scheduledMessages.mockResolvedValue({ items: [], next_after: null });
  mockApi.scheduledMessage.mockResolvedValue(resource());
  mockApi.createScheduledMessage.mockImplementation(async (_channel, input) => resource({ id: input.request_id, scheduled_at: input.scheduled_at, message: input.message }));
});
afterEach(() => jest.restoreAllMocks());

it('opens scheduling from the same composer action sheet, submits an explicit local time and clears only acknowledged text', async () => {
  const submit = jest.fn();
  await mountComposer({ onSubmit: submit });
  await fireEvent.changeText(screen.getByLabelText('Message'), '@silent Later today');
  await fireEvent.press(screen.getByLabelText('Message actions'));
  expect(screen.getByText('Photo library')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Send later'));
  expect(screen.queryByText('Photo library')).toBeNull();
  expect(screen.getByLabelText('Date (YYYY-MM-DD)')).toBeTruthy();
  expect(screen.getByLabelText('Time (HH:MM, 24-hour)')).toBeTruthy();
  expect(screen.getByText(/Local time/)).toHaveTextContent(new RegExp(Intl.DateTimeFormat().resolvedOptions().timeZone));
  let accept!: (item: ScheduledMessage) => void;
  mockApi.createScheduledMessage.mockReturnValueOnce(new Promise<ScheduledMessage>((resolve) => { accept = resolve; }));
  await fireEvent.press(screen.getByLabelText('Schedule message'));
  await waitFor(() => expect(mockApi.createScheduledMessage).toHaveBeenCalledTimes(1));
  expect(screen.getAllByLabelText('Message')[0]).toHaveProp('value', '@silent Later today');
  expect(mockApi.createScheduledMessage.mock.calls[0]?.[1]).toMatchObject({ request_id: id, message: { content: 'Later today', silent: true } });
  await act(async () => accept(resource()));
  await screen.findByText('Scheduled');
  expect(screen.getByLabelText('Message')).toHaveProp('value', '');
  expect(submit).not.toHaveBeenCalled();
});

it('uses long-press Send and retries the original stored request after remount', async () => {
  mockApi.createScheduledMessage.mockRejectedValueOnce(Object.assign(new Error('Response unavailable'), { status: 503 }));
  const first = await mountComposer();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Original text');
  await fireEvent(screen.getByLabelText('Send'), 'longPress');
  await fireEvent.press(screen.getByLabelText('Schedule message'));
  await screen.findByLabelText('Retry confirmation');
  expect(screen.getAllByLabelText('Message')[0]).toHaveProp('value', 'Original text');
  const original = mockApi.createScheduledMessage.mock.calls[0];
  await first.unmount();
  await mountComposer();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'New unrelated text');
  await fireEvent.press(screen.getByLabelText('Message actions'));
  await fireEvent.press(screen.getByLabelText('Confirm previous request'));
  expect(screen.getAllByLabelText('Message').at(-1)).toHaveProp('value', 'Original text');
  await fireEvent.press(screen.getByLabelText('Retry confirmation'));
  await screen.findByText('Scheduled');
  expect(mockApi.createScheduledMessage.mock.calls[1]).toEqual(original);
  expect(screen.getByLabelText('Message')).toHaveProp('value', 'New unrelated text');
});

it('preserves attachments and explains why they cannot be scheduled', async () => {
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///c/r.pdf', name: 'r.pdf', size: 2048, mimeType: 'application/pdf', lastModified: 0 }] });
  await mountComposer();
  await fireEvent.changeText(screen.getByLabelText('Message'), 'With document');
  await fireEvent.press(screen.getByLabelText('Message actions'));
  await fireEvent.press(screen.getByText('Files'));
  await screen.findByText('r.pdf');
  await fireEvent.press(screen.getByLabelText('Message actions'));
  expect(screen.getByLabelText('Send later')).toBeDisabled();
  expect(screen.getByText('Remove attachments to schedule a text message.')).toBeTruthy();
  expect(mockApi.createScheduledMessage).not.toHaveBeenCalled();
});

it('keeps author cancellation available while blocked from sending', async () => {
  mockApi.scheduledMessages.mockResolvedValue({ items: [resource()], next_after: null });
  mockApi.cancelScheduledMessage.mockResolvedValue(resource({ revision: 2, status: 'cancelled', message: null }));
  await mountComposer({ blockedReason: 'You cannot send here.' });
  await fireEvent.press(screen.getByText('Scheduled messages'));
  await fireEvent.press(await screen.findByLabelText('Cancel message'));
  await fireEvent.press(screen.getByLabelText('Cancel message'));
  await screen.findByText('Cancelled');
  expect(mockApi.cancelScheduledMessage).toHaveBeenCalledWith('10', id, 1);
  expect(mockApi.createScheduledMessage).not.toHaveBeenCalled();
});

it('blocks private scheduling without uploading the draft', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await mountComposer({ draftKey: undefined, scheduling: { ...context, mode: 'p2p' } });
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Private text');
  await fireEvent(screen.getByLabelText('Send'), 'longPress');
  expect(alert).toHaveBeenCalledWith('Cannot schedule this message', 'Scheduled messages are available only in Standard chats.');
  expect(mockApi.createScheduledMessage).not.toHaveBeenCalled();
  expect(useDraftStore.getState().drafts['10']).toBeUndefined();
});

it('refreshes a visible edit when returning to the foreground, retaining the local draft', async () => {
  const events = jest.spyOn(AppState, 'addEventListener');
  mockApi.scheduledMessages.mockResolvedValue({ items: [resource()], next_after: null });
  await mountSheet();
  await fireEvent.press(await screen.findByLabelText('Edit'));
  await waitFor(() => expect(mockApi.scheduledMessage).toHaveBeenCalledTimes(1));
  await fireEvent.changeText(screen.getByLabelText('Message'), 'My unsaved edit');
  const changed = events.mock.calls.find(([name]) => name === 'change')![1];
  await act(async () => changed('background'));
  mockApi.scheduledMessage.mockResolvedValueOnce(resource({ revision: 2, message: { content: 'Other device' } }));
  await act(async () => changed('active'));
  await screen.findByText('Latest version');
  expect(screen.getByLabelText('Message')).toHaveProp('value', 'My unsaved edit');
  expect(screen.getByLabelText('Save changes')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Load latest version'));
  expect(screen.getByLabelText('Message')).toHaveProp('value', 'Other device');
  expect(mockApi.editScheduledMessage).not.toHaveBeenCalled();
});

it('never presents an uncertain delivery as sent or offers a retry', async () => {
  useGuildStore.getState().upsertChannel({ id: '10', type: 0, guild_id: 'g', nsfw: true, delivery_mode: 'standard' });
  mockApi.scheduledMessages.mockResolvedValue({ items: [resource({ status: 'delivery_unknown', revision: 3, message: null, message_id: '99', failure: 'delivery_unknown' })], next_after: null });
  const jump = jest.spyOn(useReadNavStore.getState(), 'requestJump');
  await mountSheet();
  await screen.findByText('Delivery could not be confirmed');
  expect(screen.queryByLabelText('Retry confirmation')).toBeNull();
  expect(screen.queryByLabelText('Edit')).toBeNull();
  expect(screen.queryByLabelText('View message')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Inspect channel'));
  expect(jump).not.toHaveBeenCalled();
  expect(mockApi.createScheduledMessage).not.toHaveBeenCalled();
});

it('closes the old account’s open form without exposing its composer snapshot to the next account', async () => {
  useGuildStore.getState().upsertChannel({ id: '10', type: 0, guild_id: 'g', nsfw: true, delivery_mode: 'standard' });
  confirmAgeRestrictedChannel('10');
  const close = jest.fn();
  await render(wrap(<ScheduledMessagesSheet request={request('create')} context={context} canSend onAccepted={jest.fn()} onClose={close} />));
  expect(screen.getByLabelText('Message')).toHaveProp('value', 'Composer draft');
  await act(async () => useSessionStore.setState({ user: { id: '8', username: 'another', global_name: null, avatar: null } as User }));
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(close).toHaveBeenCalled();
  expect(mockApi.createScheduledMessage).not.toHaveBeenCalled();
});

it('retains scheduled status and cancellation behind Hide without rendering the body or editor', async () => {
  useGuildStore.getState().upsertChannel({ id: '10', type: 0, guild_id: 'g', nsfw: true, delivery_mode: 'standard' });
  useSessionStore.getState().setSettings({ locale: 'nl', preferences: { hide_age_restricted_channels: true } });
  mockApi.scheduledMessages.mockResolvedValue({ items: [resource()], next_after: null });
  mockApi.cancelScheduledMessage.mockResolvedValue(resource({ status: 'cancelled', revision: 2, message: null }));
  await render(wrap(<AgeRestrictedGate channelId="10"><Composer mode={{ kind: 'compose' }} blockedReason={null} placeholder="Message" canAttach onSubmit={jest.fn()} onCancelMode={jest.fn()} /></AgeRestrictedGate>));
  await fireEvent.press(screen.getByRole('button', { name: 'Geplande berichten' }));
  await screen.findByText('Scheduled');
  expect(screen.getByText(/Berichttekst en bewerken blijven verborgen/)).toBeTruthy();
  expect(screen.queryByText('Original message')).toBeNull();
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  await fireEvent.press(screen.getByLabelText('Cancel message'));
  await fireEvent.press(screen.getByLabelText('Cancel message'));
  await screen.findByText('Cancelled');
  expect(mockApi.cancelScheduledMessage).toHaveBeenCalledWith('10', id, 1);
});

it('blocks detail polling before Continue and restores unsaved editor fields after re-confirmation', async () => {
  useGuildStore.getState().upsertChannel({ id: '10', type: 0, guild_id: 'g', nsfw: true, delivery_mode: 'standard' });
  mockApi.scheduledMessages.mockResolvedValue({ items: [resource()], next_after: null });
  await mountSheet();
  await fireEvent.press(await screen.findByLabelText('Edit'));
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(mockApi.scheduledMessage).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Unsaved edit');
  await waitFor(() => expect(mockApi.scheduledMessage).toHaveBeenCalledTimes(1));
  await act(() => useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: true } }));
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(mockApi.editScheduledMessage).not.toHaveBeenCalled();
  await act(() => useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: false } }));
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByLabelText('Message')).toHaveProp('value', 'Unsaved edit');
});

it('keeps a pending retry hidden on reopen until a fresh acknowledgement, then reuses the same request', async () => {
  useGuildStore.getState().upsertChannel({ id: '10', type: 0, guild_id: 'g', nsfw: true, delivery_mode: 'standard' });
  confirmAgeRestrictedChannel('10');
  mockApi.createScheduledMessage.mockRejectedValueOnce(new Error('Response lost'));
  const first = await mountSheet('create');
  await fireEvent.press(screen.getByLabelText('Schedule message'));
  await screen.findByLabelText('Retry confirmation');
  const original = mockApi.createScheduledMessage.mock.calls[0];
  await first.unmount();
  clearAgeRestrictedConfirmations();
  await mountSheet('create');
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(screen.queryByLabelText('Retry confirmation')).toBeNull();
  expect(mockApi.createScheduledMessage).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await fireEvent.press(screen.getByLabelText('Retry confirmation'));
  await screen.findByText('Scheduled');
  expect(mockApi.createScheduledMessage.mock.calls[1]).toEqual(original);
});

it('retains the real composer’s open schedule edit across content unmount and clears only accepted text', async () => {
  useGuildStore.getState().upsertChannel({ id: '10', type: 0, guild_id: 'g', nsfw: true, delivery_mode: 'standard' });
  useGuildStore.setState({ guilds: { g: { id: 'g', owner_id: '7', roles: [] } as unknown as GuildMeta } });
  confirmAgeRestrictedChannel('10');
  await render(wrap(<AgeRestrictedGate channelId="10"><Composer mode={{ kind: 'compose' }} blockedReason={null} placeholder="Message" canAttach draftKey="10" scheduling={context} onSubmit={jest.fn()} onCancelMode={jest.fn()} /></AgeRestrictedGate>));
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Original draft');
  await fireEvent(screen.getByLabelText('Send'), 'longPress');
  await fireEvent.changeText(screen.getAllByLabelText('Message').at(-1)!, 'Schedule-only edit');
  await act(() => useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: true } }));
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(useDraftStore.getState().drafts['10']?.text).toBe('Original draft');
  await act(() => useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: false } }));
  await fireEvent.press(screen.getAllByRole('button', { name: 'Continue' }).at(-1)!);
  expect(screen.getAllByLabelText('Message').at(-1)).toHaveProp('value', 'Schedule-only edit');
  await fireEvent.press(screen.getByLabelText('Schedule message'));
  await screen.findByText('Scheduled');
  expect(screen.getByLabelText('Message')).toHaveProp('value', '');
});

it('closes an existing sheet on an instance change before showing a different account scope', async () => {
  const close = jest.fn();
  await render(wrap(<ScheduledMessagesSheet request={request('create')} context={context} canSend onAccepted={jest.fn()} onClose={close} />));
  await act(() => initialiseAgeRestrictedAccess('https://other.test'));
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(close).toHaveBeenCalled();
  expect(mockApi.createScheduledMessage).not.toHaveBeenCalled();
});
