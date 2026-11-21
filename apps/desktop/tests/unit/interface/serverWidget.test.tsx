// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import { ServerWidget, widgetJsonUrl } from '@renderer/interface/features/settings/server/ServerWidget';

const fixture = vi.hoisted(() => ({
  permissions: 32n,
  api: { guildWidgetSettings: vi.fn(), updateGuildWidgetSettings: vi.fn() },
  copyText: vi.fn(),
}));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: fixture.api }) }));
vi.mock('@renderer/interface/app/actions', () => ({ copyText: fixture.copyText, errorMessage: (error: unknown) => String(error instanceof Error ? error.message : error) }));
vi.mock('@renderer/interface/shared/hooks/usePermissions', () => ({
  useGuildPermissions: () => fixture.permissions,
  can: (permissions: bigint, bit: bigint) => (permissions & bit) === bit,
}));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ServerWidget guildId="1" /></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.permissions = 32n;
  useConnectionStore.setState({ apiUrl: 'https://api.example.test/' });
  useGuildStore.setState({
    channels: {
      '10': { id: '10', guild_id: '1', type: 0, name: 'general', position: 0 },
      '11': { id: '11', guild_id: '1', type: 2, name: 'lounge', position: 1 },
      '12': { id: '12', guild_id: '1', type: 4, name: 'category', position: 2 },
      '13': { id: '13', guild_id: '2', type: 0, name: 'other-guild', position: 0 },
    },
  } as never);
  fixture.api.guildWidgetSettings.mockResolvedValue({ enabled: false, channel_id: null });
});
afterEach(cleanup);

describe('widget settings', () => {
  it('builds the public JSON address', () => {
    expect(widgetJsonUrl('https://api.example.test/', '1')).toBe('https://api.example.test/api/v1/guilds/1/widget.json');
  });

  it('enables the widget, chooses the invite channel and copies the URL', async () => {
    fixture.api.updateGuildWidgetSettings
      .mockResolvedValueOnce({ enabled: true, channel_id: null })
      .mockResolvedValueOnce({ enabled: true, channel_id: '10' });
    mount();
    fireEvent.click(await screen.findByLabelText('Enable server widget'));
    await waitFor(() => expect(fixture.api.updateGuildWidgetSettings).toHaveBeenCalledWith('1', { enabled: true }));
    const select = await screen.findByLabelText('Invite channel');
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual(['No channel', 'Text: general', 'Voice: lounge']);
    fireEvent.change(select, { target: { value: '10' } });
    await waitFor(() => expect(fixture.api.updateGuildWidgetSettings).toHaveBeenLastCalledWith('1', { channel_id: '10' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    expect(fixture.copyText).toHaveBeenCalledWith('https://api.example.test/api/v1/guilds/1/widget.json', 'Widget URL copied');
  });

  it('shows a failed save without losing the loaded settings', async () => {
    fixture.api.updateGuildWidgetSettings.mockRejectedValue(new Error('Nope'));
    mount();
    fireEvent.click(await screen.findByLabelText('Enable server widget'));
    expect((await screen.findByRole('alert')).textContent).toContain('Nope');
  });

  it('does not fetch for members without Manage Server', () => {
    fixture.permissions = 0n;
    mount();
    expect(screen.queryByLabelText('Enable server widget')).toBeNull();
    expect(fixture.api.guildWidgetSettings).not.toHaveBeenCalled();
  });
});
