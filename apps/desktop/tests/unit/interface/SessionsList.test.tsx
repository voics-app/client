import { BRAND } from '@shared/brand';
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { AuthSession } from '@discordy/core/contracts/rest';

const base: AuthSession = {
  id: 'here',
  client: 'Desktop app',
  os: 'Windows',
  device_name: null,
  location: 'NL',
  created_at: '2026-11-01T00:00:00Z',
  last_used_at: new Date().toISOString(),
  current: true,
};
let sessions: AuthSession[] = [];
const listSessions = vi.fn(async () => sessions);
const revokeSession = vi.fn(async (id: string) => {
  sessions = sessions.filter((s) => s.id !== id);
});
const logoutOtherSessions = vi.fn(async () => {
  sessions = sessions.filter((s) => s.current);
});
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { listSessions, revokeSession, logoutOtherSessions } }) }));

import { SessionsList } from '@renderer/interface/features/settings/user/SessionsList';
import { LocaleProvider } from '@renderer/interface/shared/i18n';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SessionsList /></QueryClientProvider>);
}

beforeEach(() => {
  sessions = [base, { ...base, id: 'phone', client: 'Safari', os: 'iOS', current: false, location: null }, { ...base, id: 'web', client: 'Firefox', os: 'Linux', current: false, location: 'DE' }];
  vi.clearAllMocks();
  useUiStore.setState({ dialog: null });
});
afterEach(cleanup);

describe('SessionsList', () => {
  it('uses Dutch country and activity labels without changing the device names or revoke target', async () => {
    useSessionStore.getState().setSettings({ locale: 'nl' });
    sessions[0] = { ...base, device_name: 'Original laptop' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><LocaleProvider><SessionsList /></LocaleProvider></QueryClientProvider>);
    const rows = await screen.findAllByTestId(/^session-/);
    expect(rows[0]!.textContent).toContain(`${BRAND.displayName} op Windows (dit apparaat)`);
    expect(rows[0]!.textContent).toContain('Nederland · Original laptop · Nu actief');
    fireEvent.click(screen.getByRole('button', { name: 'Safari op iOS uitloggen' }));
    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith('phone'));
  });
  it('lists sessions with this device first and no Log out on it', async () => {
    renderList();
    const rows = await screen.findAllByTestId(/^session-/);
    const first = rows[0]!;
    expect(first.textContent).toContain(`${BRAND.displayName} on Windows (this device)`);
    expect(first.textContent).toContain('Netherlands');
    expect(first.querySelector('button')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Log out (Safari|Firefox)/ })).toHaveLength(2);
  });

  it('logs out a single device and refreshes the list', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: 'Log out Safari on iOS' }));
    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith('phone'));
    await waitFor(() => expect(screen.queryByTestId('session-phone')).toBeNull());
    expect(screen.getByTestId('session-web')).toBeTruthy();
  });

  it('asks before logging out every other device', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: 'Log out all known devices' }));
    const dialog = useUiStore.getState().dialog;
    expect(dialog?.kind).toBe('confirm');
    expect(logoutOtherSessions).not.toHaveBeenCalled();
    if (dialog?.kind === 'confirm') await dialog.onConfirm();
    expect(logoutOtherSessions).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('session-phone')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Log out all known devices' })).toBeNull();
  });

  it('hides log out all when this is the only session', async () => {
    sessions = [base];
    renderList();
    await screen.findByTestId('session-here');
    expect(screen.queryByRole('button', { name: 'Log out all known devices' })).toBeNull();
  });
});
