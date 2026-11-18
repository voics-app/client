import { useEffect } from 'react';
import { Image, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { initialiseAgeRestrictedAccess } from '@discordy/core/application/ageRestrictedAccess';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { AgeRestrictedGate } from '../../src/safety/AgeRestrictedGate';
import { AgeRestrictedSetting } from '../../src/settings/AgeRestrictedSetting';
import ChannelRoute from '../../app/servers/[guildId]/[channelId]';
import VoiceRoute from '../../app/voice/[channelId]';
import ThreadsRoute from '../../app/threads/[channelId]';
import PinsRoute from '../../app/pins/[channelId]';
import SearchRoute from '../../app/search/[channelId]';
import DmRoute from '../../app/dms/[channelId]';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';

const mockFetch = jest.fn();
const mockUpdate = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockReport = jest.fn();
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ api: { updateSettings: mockUpdate, createReport: mockReport } }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ guildId: 'g', channelId: 'adult' }), router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args) } }));
jest.mock('../../src/messages/ChannelScreen', () => ({ ChannelScreen: () => <MockContent /> }));
jest.mock('../../src/voice/VoiceScreen', () => ({ VoiceScreen: () => <MockContent /> }));
jest.mock('../../src/voice/VoiceChannelScreen', () => ({ VoiceChannelScreen: () => <MockContent /> }));
jest.mock('../../src/forum/ForumScreen', () => ({ ForumScreen: () => <MockContent /> }));
jest.mock('../../src/threads/ThreadsScreen', () => ({ ThreadsScreen: () => <MockContent /> }));
jest.mock('../../src/pins/PinsScreen', () => ({ PinsScreen: () => <MockContent /> }));
jest.mock('../../src/search/SearchScreen', () => ({ SearchScreen: () => <MockContent /> }));

function MockContent() {
  useEffect(() => { mockFetch(); }, []);
  return <><Text>Cached restricted message</Text><Image accessibilityLabel="Restricted image" source={{ uri: 'https://media.test/restricted.png' }} /></>;
}

const wrapper = ({ children }: { children: ReactNode }) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>{children}</SafeAreaProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  useGuildStore.getState().reset();
  useSessionStore.getState().reset();
  initialiseAgeRestrictedAccess('https://instance.test');
  useSessionStore.getState().setUser({ id: 'me', username: 'Me', avatar: null, global_name: null });
  useSessionStore.getState().setStatus('ready');
  useGuildStore.getState().upsertChannel({ id: 'adult', guild_id: 'g', type: 0, nsfw: true, name: '原文', delivery_mode: 'standard' });
});

it('withholds the mounted screen, cached text and remote images until Continue and closes them on remote Hide', async () => {
  await render(<AgeRestrictedGate channelId="adult"><MockContent /></AgeRestrictedGate>, { wrapper });
  expect(mockFetch).not.toHaveBeenCalled();
  expect(screen.queryByText('Cached restricted message')).toBeNull();
  expect(screen.queryByLabelText('Restricted image')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Restricted image')).toBeTruthy();
  await act(() => useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: true } }));
  expect(screen.queryByLabelText('Restricted image')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
});

it('blocks missing ancestry and offers navigation without fetching it as a message', async () => {
  useGuildStore.getState().upsertChannel({ id: 'thread', guild_id: 'g', parent_id: 'missing', type: 11, delivery_mode: 'standard' });
  await render(<AgeRestrictedGate channelId="thread"><MockContent /></AgeRestrictedGate>, { wrapper });
  expect(mockFetch).not.toHaveBeenCalled();
  expect(screen.getByText('Channel unavailable')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to conversations' }));
  expect(mockReplace).toHaveBeenCalledWith('/dms');
  await fireEvent.press(screen.getByRole('button', { name: 'Privacy settings' }));
  expect(mockPush).toHaveBeenCalledWith('/settings/privacy');
});

it('does not change the confirmed setting on failure and retries the real preference patch', async () => {
  mockUpdate.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ preferences: { hide_age_restricted_channels: true } });
  await render(<AgeRestrictedSetting />);
  await fireEvent(screen.getByRole('switch'), 'valueChange', true);
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('switch').props.value).toBe(false);
  await fireEvent(screen.getByRole('switch'), 'valueChange', true);
  await waitFor(() => expect(screen.getByRole('switch').props.value).toBe(true));
  expect(mockUpdate).toHaveBeenLastCalledWith({ preferences: { hide_age_restricted_channels: true } });
});

it.each([
  ['server text', ChannelRoute, 0], ['forum', ChannelRoute, 15], ['server voice', ChannelRoute, 2],
  ['voice deep link', VoiceRoute, 2], ['thread list', ThreadsRoute, 0], ['pins', PinsRoute, 0],
  ['search', SearchRoute, 0], ['server id in a DM deep link', DmRoute, 0],
] as const)('holds the real %s route before any child fetch or media mount', async (_name, Route, type) => {
  useGuildStore.getState().upsertChannel({ id: 'adult', guild_id: 'g', type, nsfw: true, delivery_mode: 'standard' });
  await render(<Route />, { wrapper });
  expect(mockFetch).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Restricted image')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it('reports a channel from the Dutch gate without opening content and retains a failed note for retry', async () => {
  useSessionStore.getState().setSettings({ locale: 'nl' });
  mockReport.mockRejectedValueOnce(new ApiError(403, 0, 'forbidden')).mockResolvedValueOnce(undefined);
  await render(<AgeRestrictedGate channelId="adult"><MockContent /></AgeRestrictedGate>, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Kanaal melden' }));
  expect(screen.getByText(/Berichten, onderwerpen, bijlagen en ledenlijsten/)).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Spam'));
  await fireEvent.changeText(screen.getByLabelText('Notitie (optioneel)'), '原文 behouden');
  await fireEvent.press(screen.getByLabelText('Melding verzenden'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByLabelText('Notitie (optioneel)').props.value).toBe('原文 behouden');
  await fireEvent.press(screen.getByLabelText('Melding verzenden'));
  await waitFor(() => expect(mockReport).toHaveBeenCalledTimes(2));
  expect(mockReport).toHaveBeenLastCalledWith({ target: 'channel', channel_id: 'adult', category: 'spam', note: '原文 behouden' });
  expect(mockFetch).not.toHaveBeenCalled();
});
