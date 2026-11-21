import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import { initialiseAgeRestrictedAccess } from '@discordy/core/application/ageRestrictedAccess';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { Message, MessageComponent } from '@discordy/core/contracts/rest';
import { InteractionModal } from '../../src/commands/InteractionModal';
import { MessageComponents } from '../../src/messages/components/MessageComponents';
import { withSafeArea } from '../support/safeArea';
import { resetStores, seedServer } from '../support/server';

const mockApi = { createInteraction: jest.fn(async (_body: object) => ({ id: 'i1' })) };
jest.mock('../../src/runtime', () => {
  const { InteractionService } = jest.requireActual('@discordy/core/application/interactionService');
  return { getRuntime: () => ({ interactions: new InteractionService(mockApi) }) };
});
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })) }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const row = (...components: MessageComponent[]): MessageComponent => ({ type: 1, components });
const message = (...rows: MessageComponent[]) => ({ id: 'm1', channel_id: 'general', guild_id: 'g1', application_id: 'app1', author: { id: 'bot', username: 'Bot' }, components: rows }) as unknown as Message;
const show = (...rows: MessageComponent[]) => render(withSafeArea(<MessageComponents message={message(...rows)} />));
const sent = () => mockApi.createInteraction.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  resetStores();
  seedServer(0n);
  useInteractionStore.getState().reset();
});

describe('message components', () => {
  it('shows nothing for a message without action rows', async () => {
    await show();
    expect(screen.queryByLabelText('Approve')).toBeNull();
    expect(MessageComponents({ message: message() })).toBeNull();
  });

  it('sends a button press as a component interaction for the bot behind the message', async () => {
    await show(row({ type: 2, style: 1, label: 'Approve', custom_id: 'approve' }, { type: 2, style: 4, label: 'Reject', custom_id: 'reject' }));
    await act(async () => fireEvent.press(screen.getByLabelText('Approve')));
    expect(sent()).toEqual({ type: 3, application_id: 'app1', channel_id: 'general', guild_id: 'g1', message_id: 'm1', data: { custom_id: 'approve', component_type: 2 } });
  });

  it('does not press a disabled button, and opens a link button in the browser instead of sending anything', async () => {
    await show(row({ type: 2, style: 1, label: 'Off', custom_id: 'off', disabled: true }, { type: 2, style: 5, label: 'Docs', url: 'https://example.com/docs' }, { type: 2, style: 5, label: 'Bad', url: 'javascript:alert(1)' }));
    await fireEvent.press(screen.getByLabelText('Off'));
    expect(screen.getByLabelText('Off').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Docs'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.com/docs');
    await fireEvent.press(screen.getByLabelText('Bad'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
    expect(mockApi.createInteraction).not.toHaveBeenCalled();
  });

  it('shows why a press failed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.createInteraction.mockRejectedValueOnce(new Error('Interaction expired'));
    await show(row({ type: 2, style: 2, label: 'Go', custom_id: 'go' }));
    await act(async () => fireEvent.press(screen.getByLabelText('Go')));
    expect(alert).toHaveBeenCalledWith('Interaction failed', 'Interaction expired');
    alert.mockRestore();
  });

  it('sends a single choice from a select menu at once', async () => {
    await show(row({ type: 3, custom_id: 'colour', placeholder: 'Pick a colour', options: [{ label: 'Red', value: 'r' }, { label: 'Blue', value: 'b' }] }));
    await fireEvent.press(screen.getByLabelText('Pick a colour'));
    await act(async () => fireEvent.press(await screen.findByLabelText('Blue')));
    expect(sent()).toMatchObject({ data: { custom_id: 'colour', component_type: 3, values: ['b'] } });
    expect(screen.getAllByLabelText('Blue').length).toBeGreaterThan(0);
  });

  it('collects several choices and sends them on Apply, never more than the maximum', async () => {
    await show(row({ type: 3, custom_id: 'tags', placeholder: 'Tags', min_values: 1, max_values: 2, options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }, { label: 'C', value: 'c' }] }));
    await fireEvent.press(screen.getByLabelText('Tags'));
    expect(await screen.findByLabelText('Apply')).toBeTruthy();
    expect(screen.getByLabelText('Apply').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('A'));
    await fireEvent.press(screen.getByLabelText('B'));
    await fireEvent.press(screen.getByLabelText('C'));
    expect(screen.getByLabelText('C').props.accessibilityState.checked).toBe(false);
    await act(async () => fireEvent.press(screen.getByLabelText('Apply')));
    expect(sent()).toMatchObject({ data: { custom_id: 'tags', values: ['a', 'b'] } });
  });

  it('picks a person for a user select from the server members', async () => {
    await show(row({ type: 5, custom_id: 'who', placeholder: 'Choose a member' }));
    await fireEvent.press(screen.getByLabelText('Choose a member'));
    await act(async () => fireEvent.press(await screen.findByLabelText('Pat')));
    expect(sent()).toMatchObject({ data: { custom_id: 'who', component_type: 5, values: ['u2'] } });
  });
});

describe('interaction modal', () => {
  const modal = {
    interactionId: 'i1',
    applicationId: 'app1',
    channelId: 'general',
    customId: 'feedback',
    title: 'Send feedback',
    components: [
      row({ type: 4, custom_id: 'subject', label: 'Subject', style: 1, value: 'Hello' }),
      row({ type: 4, custom_id: 'body', label: 'Details', style: 2, required: false }),
    ],
  };

  it('withholds an already open bot form after a restriction change and keeps the draft for deliberate continuation', async () => {
    initialiseAgeRestrictedAccess('https://instance.test');
    useSessionStore.getState().setStatus('ready');
    useInteractionStore.getState().openModal(modal);
    await render(withSafeArea(<InteractionModal />));
    await fireEvent.changeText(screen.getByLabelText('Subject'), 'Keep my draft');
    await act(() => useGuildStore.getState().upsertChannel({ ...useGuildStore.getState().channels.general!, nsfw: true }));
    expect(screen.queryByText('Send feedback')).toBeNull();
    expect(screen.queryByLabelText('Subject')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('Subject').props.value).toBe('Keep my draft');
    expect(mockApi.createInteraction).not.toHaveBeenCalled();
  });

  it('stays closed until an application opens a form', async () => {
    await render(withSafeArea(<InteractionModal />));
    expect(screen.queryByText('Send feedback')).toBeNull();
  });

  it('shows the form pre-filled, gates Submit on the required inputs and sends the answers back', async () => {
    useInteractionStore.getState().rememberApplication('i1', 'app1');
    await render(withSafeArea(<InteractionModal />));
    await act(async () => useInteractionStore.getState().openModal(modal));
    expect(await screen.findByText('Send feedback')).toBeTruthy();
    expect(screen.getByLabelText('Subject').props.value).toBe('Hello');
    await fireEvent.changeText(screen.getByLabelText('Subject'), '  ');
    expect(screen.getByLabelText('Submit').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Subject'), 'Great app');
    await fireEvent.changeText(screen.getByLabelText('Details'), 'More words');
    await act(async () => fireEvent.press(screen.getByLabelText('Submit')));
    expect(sent()).toEqual({
      type: 5,
      application_id: 'app1',
      channel_id: 'general',
      guild_id: 'g1',
      data: { custom_id: 'feedback', components: [row({ type: 4, custom_id: 'subject', value: 'Great app' }), row({ type: 4, custom_id: 'body', value: 'More words' })] },
    });
    expect(useInteractionStore.getState().modal).toBeNull();
  });

  it('closes without sending on Cancel', async () => {
    await render(withSafeArea(<InteractionModal />));
    await act(async () => useInteractionStore.getState().openModal(modal));
    await fireEvent.press(await screen.findByLabelText('Cancel'));
    expect(useInteractionStore.getState().modal).toBeNull();
    expect(mockApi.createInteraction).not.toHaveBeenCalled();
  });
});
