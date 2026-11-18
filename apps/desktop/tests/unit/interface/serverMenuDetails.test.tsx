// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { emptySettings } from '@discordy/core/domain/notificationSettings';
import { useGuildMenuEntries } from '@renderer/interface/features/channels/GuildMenu';
import { confirmDeleteServer } from '@renderer/interface/features/settings/server/deleteServer';
import { ConfirmDialog } from '@renderer/interface/features/shell/DialogHost';

const calls = vi.hoisted(() => ({ toggles: vi.fn(), deleteGuild: vi.fn(), copy: vi.fn() }));
vi.mock('@renderer/interface/app/notificationActions', () => ({ setGuildToggles: calls.toggles, muteGuild: vi.fn() }));
vi.mock('@renderer/interface/app/actions', async (load) => ({ ...await load<object>(), deleteGuild: calls.deleteGuild, copyText: calls.copy }));

beforeEach(() => {
  vi.clearAllMocks();
  useGuildStore.setState({ guilds: { g: { id: 'g', name: 'Test server', owner_id: 'owner', roles: [] } } as never, channels: {}, members: {} });
  useSessionStore.setState({ user: { id: 'owner' } as never });
  useNotificationSettingsStore.setState({ byScope: { g: emptySettings('g') } });
  useUiStore.setState({ dialog: null, settings: null });
});
afterEach(cleanup);

describe('server menu details', () => {
  it('offers notification, hide muted, collapse, privacy and copy actions from the shared menu', () => {
    const { result } = renderHook(() => useGuildMenuEntries('g'));
    const items = result.current.filter((entry) => entry.kind === 'item');
    expect(items.map((entry) => entry.label)).toEqual(expect.arrayContaining(['Notification settings', 'Hide muted channels', 'Collapse all categories', 'Privacy settings', 'Copy server ID']));
    items.find((entry) => entry.label === 'Hide muted channels')!.onSelect();
    expect(calls.toggles).toHaveBeenCalledWith('g', { hide_muted_channels: true });
    items.find((entry) => entry.label === 'Copy server ID')!.onSelect();
    expect(calls.copy).toHaveBeenCalledWith('g', 'Server ID copied');
  });

  it('requires the exact name before deleting and retains the confirmation on failure', async () => {
    confirmDeleteServer('g');
    const dialog = useUiStore.getState().dialog;
    if (dialog?.kind !== 'confirm') throw new Error('Expected delete confirmation');
    render(<ConfirmDialog dialog={dialog} />);
    const button = screen.getByRole('button', { name: 'Delete server' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test server' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Test server' } });
    expect(button.disabled).toBe(false);
    calls.deleteGuild.mockRejectedValueOnce(new Error('Server unavailable'));
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('Server unavailable');
    expect(useUiStore.getState().dialog).toBe(dialog);
    calls.deleteGuild.mockResolvedValueOnce(undefined);
    fireEvent.click(button);
    await waitFor(() => expect(useUiStore.getState().dialog).toBeNull());
    expect(calls.deleteGuild).toHaveBeenCalledWith('g');
  });

  it('never offers deletion to non-owners', () => {
    useSessionStore.setState({ user: { id: 'member' } as never });
    const { result } = renderHook(() => useGuildMenuEntries('g'));
    expect(result.current.some((entry) => entry.kind === 'item' && entry.label === 'Delete server')).toBe(false);
    confirmDeleteServer('g');
    expect(useUiStore.getState().dialog).toBeNull();
  });
});
