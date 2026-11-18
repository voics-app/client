// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { initialiseAgeRestrictedAccess } from '@discordy/core/application/ageRestrictedAccess';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { LocaleProvider } from '../../../src/renderer/interface/shared/i18n';
import { AgeRestrictedGate } from '../../../src/renderer/interface/features/channels/AgeRestrictedGate';
import { AgeRestrictedSetting } from '../../../src/renderer/interface/features/settings/user/AgeRestrictedSetting';
import { StageHost } from '../../../src/renderer/interface/features/voice/StageHost';
import { ReactionUsersDialog } from '../../../src/renderer/interface/features/chat/ReactionUsersDialog';

const { fetchContent, updateSettings, joinVoice, reactionUsers } = vi.hoisted(() => ({ fetchContent: vi.fn(), updateSettings: vi.fn(), joinVoice: vi.fn(), reactionUsers: vi.fn() }));
vi.mock('../../../src/renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { updateSettings, reactionUsers } }) }));
vi.mock('../../../src/renderer/interface/features/chat/ChatView', () => ({ ChatView: () => <FetchedContent /> }));
vi.mock('../../../src/renderer/interface/features/chat/ForumView', () => ({ ForumView: () => <FetchedContent /> }));
vi.mock('../../../src/renderer/interface/features/voice/VoiceChannelView', () => ({ VoiceChannelView: () => <FetchedContent /> }));

function FetchedContent() {
  useEffect(() => { fetchContent(); }, []);
  return <div>Cached private preview<img alt="restricted attachment" src="https://media.test/restricted.png" /></div>;
}
const channel = (id: string, type: Channel['type'] = ChannelType.GUILD_TEXT): Channel => ({ id, type, guild_id: 'g', name: '原文 kanaal', nsfw: true, delivery_mode: 'standard' });
const show = (node: React.ReactNode) => render(<LocaleProvider>{node}</LocaleProvider>);
afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  useGuildStore.getState().reset();
  useSessionStore.getState().reset();
  initialiseAgeRestrictedAccess('https://instance.test');
  useSessionStore.getState().setUser({ id: 'me', username: 'me', avatar: null, global_name: null });
  useSessionStore.getState().setStatus('ready');
  useSessionStore.getState().setSettings({ locale: 'nl' });
  useGuildStore.getState().upsertChannel(channel('adult'));
});

it.each([ChannelType.GUILD_TEXT, ChannelType.GUILD_FORUM, ChannelType.GUILD_VOICE])('does not mount the %s stage or media until Dutch Continue', (type) => {
  useGuildStore.getState().upsertChannel(channel('adult', type));
  show(<StageHost channelId="adult" />);
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Kanaal met leeftijdsbeperking' }));
  expect(screen.getByText('#原文 kanaal')).toBeTruthy();
  expect(fetchContent).not.toHaveBeenCalled();
  expect(screen.queryByRole('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Doorgaan' }));
  expect(fetchContent).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('img').getAttribute('src')).toBe('https://media.test/restricted.png');
  act(() => useSessionStore.getState().setSettings({ preferences: { hide_age_restricted_channels: true } }));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Doorgaan' })).toBeNull();
});

it('protects unknown direct links and gives a safe exit and privacy settings', () => {
  show(<AgeRestrictedGate channelId="missing"><FetchedContent /></AgeRestrictedGate>);
  expect(fetchContent).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Doorgaan' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Privacyinstellingen' }));
  expect(useUiStore.getState().settings).toEqual({ kind: 'user', tab: 'privacy' });
  fireEvent.click(screen.getByRole('button', { name: 'Terug naar gesprekken' }));
  expect(useUiStore.getState().view).toEqual({ kind: 'home', channelId: null });
});

it('keeps the confirmed preference after a failed Dutch save and allows retry', async () => {
  updateSettings.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ preferences: { hide_age_restricted_channels: true } });
  show(<AgeRestrictedSetting />);
  const toggle = screen.getByRole('switch', { name: 'Kanalen met leeftijdsbeperking verbergen' });
  fireEvent.click(toggle);
  expect((await screen.findByRole('alert')).textContent).toContain('Je vorige keuze blijft actief');
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
  expect(updateSettings).toHaveBeenLastCalledWith({ preferences: { hide_age_restricted_channels: true } });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not join an age-restricted voice channel through the action facade', async () => {
  const { joinVoiceChannel, registerVoice } = await import('../../../src/renderer/interface/app/voiceActions');
  registerVoice({ join: joinVoice } as never);
  await joinVoiceChannel('g', 'adult');
  expect(joinVoice).not.toHaveBeenCalled();
  expect(useUiStore.getState().view.channelId).toBe('adult');
  registerVoice(null);
});

it('does not fetch reaction members through a cached dialog until confirmation', async () => {
  reactionUsers.mockResolvedValue([]);
  show(<ReactionUsersDialog channelId="adult" messageId="m" emoji="x" />);
  expect(reactionUsers).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Doorgaan' }));
  await waitFor(() => expect(reactionUsers).toHaveBeenCalledWith('adult', 'm', 'x'));
});
