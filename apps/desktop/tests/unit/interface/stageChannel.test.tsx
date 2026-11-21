// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { ALL_PERMISSIONS } from '@discordy/core/contracts/permissions';
import type { StageInstance } from '@discordy/core/contracts/rest';
import { StageChannelView } from '@renderer/interface/features/voice/StageChannelView';
import { registerVoice, type VoiceFacade } from '@renderer/interface/app/voiceActions';

const api = vi.hoisted(() => ({
  stageInstance: vi.fn(async (): Promise<StageInstance | null> => null),
  startStage: vi.fn(async (_id: string, topic: string) => ({ id: 'stage', guild_id: 'g', channel_id: 'c', topic, privacy_level: 2, discoverable_disabled: false })),
  updateStage: vi.fn(async (_id: string, topic: string) => ({ id: 'stage', guild_id: 'g', channel_id: 'c', topic, privacy_level: 2, discoverable_disabled: false })),
  endStage: vi.fn(async () => undefined),
  updateMember: vi.fn(async () => ({})),
}));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('starts, edits and ends a stage with audience entry', async () => {
  useSessionStore.setState({ user: { id: 'owner', username: 'owner', global_name: null, avatar: null } } as never);
  useGuildStore.setState({ guilds: { g: { id: 'g', owner_id: 'owner', roles: [{ id: 'g', permissions: ALL_PERMISSIONS.toString() }] } }, members: { g: {} }, channels: { c: { id: 'c', guild_id: 'g', type: 13, name: 'Town hall' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><StageChannelView channelId="c" /></QueryClientProvider>);
  await screen.findByText('No stage is live.');
  expect(screen.getByText('Audience members join muted.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Stage topic'), { target: { value: 'Town hall' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start stage' }));
  await waitFor(() => expect(api.startStage).toHaveBeenCalledWith('c', 'Town hall'));
  await screen.findByText('Stage is live.');
  expect(screen.getByRole('button', { name: 'Join stage' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Stage topic'), { target: { value: 'Questions' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save topic' }));
  await waitFor(() => expect(api.updateStage).toHaveBeenCalledWith('c', 'Questions'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'End stage' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'End stage' }));
  await waitFor(() => expect(api.endStage).toHaveBeenCalledWith('c'));
  await screen.findByText('No stage is live.');
});

it('raises a hand and lets a moderator promote an audience member', async () => {
  const live: StageInstance = { id: 'stage', guild_id: 'g', channel_id: 'c', topic: 'Town hall', privacy_level: 2, discoverable_disabled: false };
  api.stageInstance.mockResolvedValueOnce(live);
  useSessionStore.setState({ user: { id: 'owner', username: 'owner', global_name: null, avatar: null } } as never);
  useGuildStore.setState({ guilds: { g: { id: 'g', owner_id: 'owner', roles: [{ id: 'g', permissions: ALL_PERMISSIONS.toString() }] } }, members: { g: {} }, channels: { c: { id: 'c', guild_id: 'g', type: 13, name: 'Town hall' } } } as never);
  useVoiceStore.setState({
    call: { status: 'connected', guildId: 'g', channelId: 'c', region: 'eu', error: null, e2ee: false, quality: null, rttHistory: [] },
    states: { g: {
      owner: { guild_id: 'g', channel_id: 'c', user_id: 'owner', session_id: 'self', deaf: false, mute: false, self_deaf: false, self_mute: true, self_video: false, suppress: true },
      guest: { guild_id: 'g', channel_id: 'c', user_id: 'guest', session_id: 'guest-session', deaf: false, mute: false, self_deaf: false, self_mute: true, self_video: false, suppress: true, request_to_speak_timestamp: '2026-11-20T01:00:00Z' },
    } },
  });
  const requestToSpeak = vi.fn(async () => undefined);
  registerVoice({
    join: vi.fn(async () => undefined), leave: vi.fn(async () => undefined), setMute: vi.fn(async () => undefined),
    setDeaf: vi.fn(async () => undefined), setCamera: vi.fn(async () => undefined), requestToSpeak,
    startScreenShare: vi.fn(async () => ({ ok: true as const })), stopScreenShare: vi.fn(async () => undefined),
    setScreenPreset: vi.fn(async () => undefined), setUserVolume: vi.fn(),
  } satisfies VoiceFacade);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><StageChannelView channelId="c" /></QueryClientProvider>);
  await screen.findByText('Stage is live.');
  fireEvent.click(screen.getByRole('button', { name: 'Raise hand' }));
  expect(requestToSpeak).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Invite to speak' }));
  await waitFor(() => expect(api.updateMember).toHaveBeenCalledWith('g', 'guest', { suppress: false }));
});
