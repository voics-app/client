// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ServerCommunity } from '@renderer/interface/features/settings/server/ServerCommunity';
import { ServerDiscovery } from '@renderer/interface/features/settings/server/ServerDiscovery';
import { DiscoverView } from '@renderer/interface/features/discover/DiscoverView';

const api = { updateGuild: vi.fn(), guildDiscovery: vi.fn(), discoveryCategories: vi.fn(), discoveryGuilds: vi.fn(), putGuildDiscovery: vi.fn() };
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api }) }));
vi.mock('@renderer/interface/app/navigation', () => ({ openGuild: vi.fn() }));
const renderQuery = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  useGuildStore.setState({ guilds: { g1: { id: 'g1', name: 'Public hub', features: [] } }, channels: {
    c1: { id: 'c1', guild_id: 'g1', type: 0, name: 'rules', delivery_mode: 'standard' },
    c2: { id: 'c2', guild_id: 'g1', type: 5, name: 'updates', delivery_mode: 'standard' },
    c3: { id: 'c3', guild_id: 'g1', type: 0, name: 'private-copy', delivery_mode: 'ephemeral' },
    c4: { id: 'c4', guild_id: 'g1', type: 0, name: 'age-restricted', nsfw: true },
  } } as never);
  api.discoveryCategories.mockResolvedValue(['community']);
});
afterEach(cleanup);

it('requires valid channels and saves Community, retaining the draft after a failure', async () => {
  api.updateGuild.mockRejectedValueOnce(new Error('Please retry')).mockResolvedValueOnce({ id: 'g1', features: ['COMMUNITY'], rules_channel_id: 'c1', public_updates_channel_id: 'c2' });
  renderQuery(<ServerCommunity guildId="g1" />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Community' }));
  expect((screen.getByRole('button', { name: 'Save Community' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('option', { name: '#private-copy' })).toBeNull();
  expect(screen.queryByRole('option', { name: '#age-restricted' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Rules channel'), { target: { value: 'c1' } });
  fireEvent.change(screen.getByLabelText('Updates channel'), { target: { value: 'c2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Community' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Please retry');
  expect((screen.getByLabelText('Rules channel') as HTMLSelectElement).value).toBe('c1');
  fireEvent.click(screen.getByRole('button', { name: 'Save Community' }));
  await screen.findByText('Community settings saved.');
  expect(api.updateGuild).toHaveBeenLastCalledWith('g1', { features: ['COMMUNITY'], rules_channel_id: 'c1', public_updates_channel_id: 'c2' });
  expect(useGuildStore.getState().guilds.g1?.features).toEqual(['COMMUNITY']);
});

it('explains and saves disabling Community', async () => {
  useGuildStore.getState().patchGuild({ id: 'g1', features: ['COMMUNITY'], rules_channel_id: 'c1', public_updates_channel_id: 'c2' });
  api.updateGuild.mockResolvedValue({ id: 'g1', features: [], rules_channel_id: null, public_updates_channel_id: null });
  renderQuery(<ServerCommunity guildId="g1" />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Community' }));
  expect(screen.getByText(/remove this server from Discover/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save Community' }));
  await waitFor(() => expect(api.updateGuild).toHaveBeenCalledWith('g1', { features: [] }));
  await screen.findByText('Community settings saved.');
});

it('labels an ineligible opted-in listing as paused and still allows removal', async () => {
  api.guildDiscovery.mockResolvedValue({ enabled: true, category: 'community', tags: [], member_count: 5, blockers: ['COMMUNITY_REQUIRED'] });
  api.putGuildDiscovery.mockResolvedValue({ enabled: false, category: null, tags: [], member_count: 5, blockers: ['COMMUNITY_REQUIRED'] });
  renderQuery(<ServerDiscovery guildId="g1" />);
  expect(await screen.findByText(/listing is paused/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Save listing' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove from Discover' }));
  await waitFor(() => expect(api.putGuildDiscovery).toHaveBeenCalledWith('g1', { enabled: false, category: 'community', tags: [] }));
});

it('opens a listing report from its Discover card', async () => {
  api.discoveryGuilds.mockResolvedValue({ guilds: [{ id: 'g2', name: 'Another hub', description: 'Public listing', icon: null, category: 'community', tags: [], approximate_member_count: 5, approximate_presence_count: null }], total: 1, offset: 0, limit: 24 });
  renderQuery(<DiscoverView />);
  fireEvent.click(await screen.findByRole('button', { name: 'Report Another hub listing' }));
  expect(useUiStore.getState().dialog).toEqual({ kind: 'report', target: { kind: 'guild', guildId: 'g2', guildName: 'Another hub' } });
});
