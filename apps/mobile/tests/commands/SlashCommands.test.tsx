import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import type { ApplicationCommand, Channel } from '@discordy/core/contracts/rest';
import { ThinkingRows } from '../../src/commands/ThinkingRows';
import { Composer } from '../../src/messages/Composer';
import { withSafeArea } from '../support/safeArea';
import { resetStores, seedServer } from '../support/server';

const T = { STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6 };
const commands: ApplicationCommand[] = [
  { id: 'c1', application_id: 'app1', name: 'ping', description: 'Pong', options: [] },
  {
    id: 'c2',
    application_id: 'app1',
    name: 'roll',
    description: 'Roll dice',
    options: [
      { type: T.INTEGER, name: 'sides', description: 'Sides', required: true, min_value: 2, max_value: 100 },
      { type: T.STRING, name: 'mode', description: 'Mode', choices: [{ name: 'Sum', value: 'sum' }, { name: 'Max', value: 'max' }] },
      { type: T.BOOLEAN, name: 'secret', description: 'Hide it' },
    ],
  },
  { id: 'c3', application_id: 'app1', name: 'poke', description: 'Poke someone', options: [{ type: T.USER, name: 'who', description: 'Who', required: true }] },
];

const mockApi = {
  commandIndex: jest.fn(async (_g: string) => ({ applications: [{ id: 'app1', name: 'Dicebot', icon: null, bot_id: null }], application_commands: commands })),
  createInteraction: jest.fn(async (_body: object) => ({ id: 'i1' })),
  applications: jest.fn(async () => []),
  globalCommands: jest.fn(async (_id: string) => []),
};
jest.mock('../../src/runtime', () => {
  const { InteractionService } = jest.requireActual('@discordy/core/application/interactionService');
  return { getRuntime: () => ({ interactions: new InteractionService(mockApi) }) };
});
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const channel = { id: 'general', type: 0, guild_id: 'g1', name: 'general', delivery_mode: 'standard' } as Channel;
const mount = (slashChannel: Channel | null = channel, onSubmit = jest.fn()) =>
  render(withSafeArea(<Composer mode={{ kind: 'compose' }} blockedReason={null} placeholder="Message #general" canAttach slashChannel={slashChannel ?? undefined} onSubmit={onSubmit} onCancelMode={jest.fn()} />));

beforeEach(() => {
  jest.clearAllMocks();
  resetStores();
  seedServer(0n);
  useInteractionStore.getState().reset();
});

describe('slash commands in the composer', () => {
  it('lists the server commands as soon as a slash is typed, narrowing as you type', async () => {
    await mount();
    expect(screen.queryByLabelText('Commands')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Message'), '/');
    expect(await screen.findByLabelText('Command ping')).toBeTruthy();
    expect(screen.getByLabelText('Command roll')).toBeTruthy();
    expect(screen.getAllByText('Dicebot')).toHaveLength(3);
    expect(mockApi.commandIndex).toHaveBeenCalledWith('g1');
    await fireEvent.changeText(screen.getByLabelText('Message'), '/ro');
    expect(screen.queryByLabelText('Command ping')).toBeNull();
    expect(screen.getByLabelText('Command roll')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Message'), '/zzz');
    expect(screen.getByText('No command matches "zzz".')).toBeTruthy();
  });

  it('offers nothing where commands are not allowed, and ordinary text is just a message', async () => {
    await mount(null);
    await fireEvent.changeText(screen.getByLabelText('Message'), '/');
    expect(screen.queryByLabelText('Commands')).toBeNull();
    expect(mockApi.commandIndex).not.toHaveBeenCalled();
  });

  it('runs a command with options: required ones gate Run, and the interaction carries the typed values', async () => {
    await mount();
    await fireEvent.changeText(screen.getByLabelText('Message'), '/roll');
    await fireEvent.press(await screen.findByLabelText('Command roll'));
    expect(screen.getByLabelText('Message').props.value).toBe('');
    expect(await screen.findByText('/roll')).toBeTruthy();
    expect(screen.getByLabelText('Run command').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('sides'), '1');
    expect(await screen.findByText('Must be at least 2')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('sides'), '20');
    await fireEvent.press(screen.getByLabelText('mode: Max'));
    await fireEvent(screen.getByLabelText('secret'), 'valueChange', true);
    expect(screen.getByLabelText('Run command').props.accessibilityState.disabled).toBe(false);
    await act(async () => fireEvent.press(screen.getByLabelText('Run command')));
    expect(mockApi.createInteraction).toHaveBeenCalledWith({
      type: 2,
      application_id: 'app1',
      channel_id: 'general',
      guild_id: 'g1',
      data: { id: 'c2', name: 'roll', type: 1, options: [{ name: 'sides', type: 4, value: 20 }, { name: 'mode', type: 3, value: 'max' }, { name: 'secret', type: 5, value: true }] },
    });
    expect(useInteractionStore.getState().pending.general).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('/roll')).toBeNull());
  });

  it('picks a person for a user option from the server members', async () => {
    await mount();
    await fireEvent.changeText(screen.getByLabelText('Message'), '/poke');
    await fireEvent.press(await screen.findByLabelText('Command poke'));
    await fireEvent.press(await screen.findByLabelText('Choose who'));
    await fireEvent.changeText(screen.getByLabelText('Search'), 'pat');
    expect(screen.queryByLabelText('Sam')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Pat'));
    expect(screen.getByText('Pat')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText('Run command')));
    expect(mockApi.createInteraction).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ options: [{ name: 'who', type: 6, value: 'u2' }] }) }));
  });

  it('shows the refusal when the command cannot run, and keeps the sheet open', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApi.createInteraction.mockRejectedValueOnce(new Error('Unknown application'));
    await mount();
    await fireEvent.changeText(screen.getByLabelText('Message'), '/ping');
    await fireEvent.press(await screen.findByLabelText('Command ping'));
    await act(async () => fireEvent.press(await screen.findByLabelText('Run command')));
    expect(alert).toHaveBeenCalledWith('Command failed', 'Unknown application');
    expect(screen.getByText('/ping')).toBeTruthy();
    alert.mockRestore();
  });
});

describe('thinking rows', () => {
  it('shows an unanswered command until its answer arrives', async () => {
    await render(<ThinkingRows channelId="general" />);
    expect(screen.queryByText('Dicebot is thinking...')).toBeNull();
    await act(async () => useInteractionStore.getState().addPending({ id: 'i1', channelId: 'general', applicationId: 'app1', appName: 'Dicebot', label: 'roll', startedAt: Date.now() }));
    expect(screen.getByText('Dicebot is thinking...')).toBeTruthy();
    await act(async () => useInteractionStore.getState().resolvePending('general', 'i1'));
    expect(screen.queryByText('Dicebot is thinking...')).toBeNull();
  });
});
