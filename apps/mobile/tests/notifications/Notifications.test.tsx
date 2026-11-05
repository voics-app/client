import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { AppState } from 'react-native';
import { useMentionInboxStore } from '@discordy/core/application/stores/mentionInboxStore';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { emptySettings } from '@discordy/core/domain/notificationSettings';
import type { Message } from '@discordy/core/contracts/rest';
import { offerBanner, useBannerStore } from '../../src/notifications/bannerStore';
import { ME, PAT, resetStores, seedServer } from '../support/server';

const mockApi = {
  messages: jest.fn(async (_c: string, _q?: object): Promise<Message[]> => []),
  ack: jest.fn(async () => undefined),
};
const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn(), send: jest.fn() }, api: mockApi, apiUrl: 'https://api.test' }) }));

const entry = (id: string, preview: string) => ({ id, guildId: 'g1', channelId: 'general', authorId: PAT.id, authorName: 'Pat', preview, timestamp: new Date().toISOString() });
const incoming = (extra: object = {}) =>
  ({ id: '2000', channel_id: 'general', guild_id: 'g1', author: PAT, content: 'ping **you**', timestamp: new Date().toISOString(), mentions: [], mention_roles: [], mention_everyone: false, attachments: [], embeds: [], type: 0, ...extra }) as unknown as ChatMessage;

async function openInbox() {
  await renderRouter('./app', { initialUrl: '/servers/g1' });
  await fireEvent.press(await screen.findByLabelText('Notifications'));
}

describe('notifications screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    seedServer(0n);
    useMentionInboxStore.getState().clear();
    useReadNavStore.setState({ jump: null });
    useMessageStore.getState().reset();
  });

  it('says when there is nothing and has no bulk action', async () => {
    await openInbox();
    expect(await screen.findByText(/No recent mentions/)).toBeTruthy();
    expect(screen.queryByLabelText('Mark all read')).toBeNull();
  });

  it('lists mentions under their server with author, channel and text', async () => {
    useMentionInboxStore.getState().addMany([entry('11', 'first one'), entry('12', 'second one')]);
    await openInbox();
    expect(await screen.findByText('Home Base')).toBeTruthy();
    expect(screen.getByText('first one')).toBeTruthy();
    expect(screen.getByText('second one')).toBeTruthy();
    expect(screen.getAllByLabelText('Open mention from Pat in #general')).toHaveLength(2);
  });

  it('jumps to the message in its channel when tapped', async () => {
    useMentionInboxStore.getState().add(entry('11', 'look here'));
    mockApi.messages.mockResolvedValueOnce([incoming({ id: '11', content: 'look here' }) as unknown as Message]);
    await openInbox();
    await fireEvent.press(await screen.findByLabelText('Open mention from Pat in #general'));
    expect(screen).toHavePathname('/servers/g1/general');
    expect(await screen.findByText('look here', { exact: false })).toBeTruthy();
    expect(mockApi.messages).toHaveBeenCalledWith('general', { around: '11', limit: 50 });
    expect(useReadNavStore.getState().jump).toBeNull();
  });

  it('marks one mention read, then all of them', async () => {
    useMentionInboxStore.getState().addMany([entry('11', 'first one'), entry('12', 'second one')]);
    await openInbox();
    await fireEvent.press((await screen.findAllByLabelText('Mark mention from Pat as read'))[0]!);
    expect(useMentionInboxStore.getState().entries.map((e) => e.id)).toEqual(['11']);
    await fireEvent.press(screen.getByLabelText('Mark all read'));
    expect(useMentionInboxStore.getState().entries).toEqual([]);
    expect(await screen.findByText(/No recent mentions/)).toBeTruthy();
  });
});

describe('in-app banner', () => {
  const appState = (value: string) => Object.defineProperty(AppState, 'currentState', { value, configurable: true });
  beforeEach(() => {
    resetStores();
    seedServer(0n);
    appState('active');
    useBannerStore.setState({ banner: null, viewing: null });
    useNotificationSettingsStore.getState().hydrate([]);
  });

  it('raises a banner for a message elsewhere and shows it over the app', async () => {
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await act(async () => offerBanner(incoming()));
    expect(await screen.findByLabelText('Pat in #general: ping you')).toBeTruthy();
  });

  it('opens the message when tapped', async () => {
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await act(async () => offerBanner(incoming()));
    await fireEvent.press(await screen.findByLabelText('Pat in #general: ping you'));
    expect(screen).toHavePathname('/servers/g1/general');
    expect(useBannerStore.getState().banner).toBeNull();
  });

  it('can be dismissed', async () => {
    await renderRouter('./app', { initialUrl: '/servers/g1' });
    await act(async () => offerBanner(incoming()));
    await fireEvent.press(await screen.findByLabelText('Dismiss notification'));
    expect(screen.queryByLabelText('Dismiss notification')).toBeNull();
  });

  it('stays quiet for your own message', () => {
    offerBanner(incoming({ author: ME }));
    expect(useBannerStore.getState().banner).toBeNull();
  });

  it('stays quiet for a message in the chat on screen', () => {
    useBannerStore.getState().setViewing('general');
    offerBanner(incoming());
    expect(useBannerStore.getState().banner).toBeNull();
  });

  it('stays quiet when the app is in the background, the server is muted or Do Not Disturb is on', () => {
    appState('background');
    offerBanner(incoming());
    expect(useBannerStore.getState().banner).toBeNull();
    appState('active');
    useNotificationSettingsStore.getState().hydrate([{ ...emptySettings('g1'), muted: true }]);
    offerBanner(incoming());
    expect(useBannerStore.getState().banner).toBeNull();
    useNotificationSettingsStore.getState().hydrate([]);
    useSessionStore.setState({ settings: { status: 'dnd' } as never });
    offerBanner(incoming());
    expect(useBannerStore.getState().banner).toBeNull();
  });
});
