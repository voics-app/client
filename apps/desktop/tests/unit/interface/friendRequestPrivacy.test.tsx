// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { PrivacyTab } from '@renderer/interface/features/settings/user/UserTabs';

const calls = vi.hoisted(() => ({ updateSettings: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { updateSettings: calls.updateSettings } }) }));
afterEach(() => { cleanup(); useSessionStore.getState().reset(); vi.clearAllMocks(); });

describe('friend request privacy', () => {
  it('hides controls against older servers and writes only the changed flag', async () => {
    useSessionStore.setState({ settings: { default_delivery_mode: 'standard' } });
    const view = render(<PrivacyTab />);
    expect(screen.queryByRole('switch', { name: 'Friend requests from everyone' })).toBeNull();
    useSessionStore.getState().setSettings({ friend_source_flags: { all: true, mutual_friends: false, mutual_guilds: false } });
    expect((await screen.findByRole('switch', { name: 'Friend requests from everyone' })).getAttribute('aria-checked')).toBe('true');
    calls.updateSettings.mockResolvedValue({ default_delivery_mode: 'standard', friend_source_flags: { all: false, mutual_friends: false, mutual_guilds: false } });
    fireEvent.click(screen.getByRole('switch', { name: 'Friend requests from everyone' }));
    await waitFor(() => expect(calls.updateSettings).toHaveBeenCalledWith({ friend_source_flags: { all: false } }));
    await waitFor(() => expect(useSessionStore.getState().settings.friend_source_flags?.all).toBe(false));
    view.unmount();
  });
});
