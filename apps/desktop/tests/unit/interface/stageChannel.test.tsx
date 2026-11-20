// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ALL_PERMISSIONS } from '@discordy/core/contracts/permissions';
import { StageChannelView } from '@renderer/interface/features/voice/StageChannelView';

const api = vi.hoisted(() => ({
  stageInstance: vi.fn(async () => null),
  startStage: vi.fn(async (_id: string, topic: string) => ({ id: 'stage', guild_id: 'g', channel_id: 'c', topic, privacy_level: 2, discoverable_disabled: false })),
  updateStage: vi.fn(async (_id: string, topic: string) => ({ id: 'stage', guild_id: 'g', channel_id: 'c', topic, privacy_level: 2, discoverable_disabled: false })),
  endStage: vi.fn(async () => undefined),
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
