import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { UserPanel } from '../../src/shell/UserPanel';
import { withSafeArea } from '../support/safeArea';
import { ME } from '../support/server';

const mockApi = { updateSettings: jest.fn(async (_patch: object) => ({})) };
const mockGateway = { send: jest.fn() };
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ api: mockApi, gateway: mockGateway }) }));

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.getState().reset();
  usePresenceStore.getState().reset();
  useSessionStore.setState({ status: 'ready', user: ME as never });
});

describe('UserPanel', () => {
  it('shows the presence dot on the avatar and the status name under the name', async () => {
    await render(withSafeArea(<UserPanel />));
    expect(screen.getByTestId('status-online')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('shows the status the gateway reports, so automatic idle is visible', async () => {
    usePresenceStore.getState().set('u1', { status: 'idle', activities: [] });
    await render(withSafeArea(<UserPanel />));
    expect(screen.getByTestId('status-idle')).toBeTruthy();
    expect(screen.getByText('Idle')).toBeTruthy();
  });

  it('shows a hollow dot while invisible and the custom status in place of the status name', async () => {
    useSessionStore.getState().setSettings({ status: 'invisible', custom_status: { text: 'Lunch', emoji_id: null, emoji_name: null, expires_at: null } });
    await render(withSafeArea(<UserPanel />));
    expect(screen.getByTestId('status-invisible')).toBeTruthy();
    expect(screen.getByText('Lunch')).toBeTruthy();
  });

  it('opens the status sheet, and choosing a status saves and publishes it', async () => {
    await render(withSafeArea(<UserPanel />));
    await fireEvent.press(screen.getByLabelText('Account and status'));
    await fireEvent.press(await screen.findByLabelText('Do not disturb'));
    expect(useSessionStore.getState().settings.status).toBe('dnd');
    expect(mockApi.updateSettings).toHaveBeenCalledWith({ status: 'dnd' });
    expect(mockGateway.send).toHaveBeenCalled();
  });

  it('sets a custom status from the sheet with an expiry', async () => {
    await render(withSafeArea(<UserPanel />));
    await fireEvent.press(screen.getByLabelText('Account and status'));
    await fireEvent.press(await screen.findByLabelText('Set custom status'));
    await fireEvent.changeText(screen.getByLabelText('Custom status'), 'In a meeting');
    await fireEvent.press(screen.getByLabelText('Clear after: 1 hour'));
    await act(async () => fireEvent.press(screen.getByLabelText('Save status')));
    const saved = useSessionStore.getState().settings.custom_status;
    expect(saved?.text).toBe('In a meeting');
    expect(saved?.expires_at).not.toBeNull();
    expect(mockApi.updateSettings).toHaveBeenCalledWith({ custom_status: saved });
  });

  it('reaches Edit profile and the settings from the sheet, and the gear opens the settings', async () => {
    await render(withSafeArea(<UserPanel />));
    await fireEvent.press(screen.getByLabelText('Account and status'));
    await fireEvent.press(await screen.findByLabelText('Edit profile'));
    expect(router.push).toHaveBeenCalledWith('/settings/profile');
    await fireEvent.press(screen.getByLabelText('User settings'));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});
