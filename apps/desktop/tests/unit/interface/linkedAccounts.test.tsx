// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { LinkedAccounts } from '@renderer/interface/features/settings/user/LinkedAccounts';
import { ProfileDialog } from '@renderer/interface/features/members/ProfileDialog';
const f = vi.hoisted(() => ({ api: { connections: vi.fn(), authorizeGithubConnection: vi.fn(), setConnectionVisibility: vi.fn(), deleteConnection: vi.fn(), userConnections: vi.fn(), user: vi.fn() }, open: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: f.api }) }));
vi.mock('@renderer/interface/app/links', () => ({ openExternalUrl: f.open }));
beforeEach(() => { useSessionStore.setState({ user: { id: '1', username: 'alice' } as never }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); useSessionStore.getState().reset(); });
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LinkedAccounts /></QueryClientProvider>); }
it('opens a trusted authorization URL and refreshes after the browser flow', async () => {
  f.api.connections.mockResolvedValue([]);
  f.api.authorizeGithubConnection.mockResolvedValue({ url: 'https://github.com/login/oauth/authorize?state=test' });
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));
  await waitFor(() => expect(f.open).toHaveBeenCalledWith('https://github.com/login/oauth/authorize?state=test'));
  f.api.connections.mockResolvedValue([{ provider: 'github', account_id: '1', name: 'alice', visible: false }]);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Linked as alice')).toBeTruthy();
  expect((screen.getByRole('checkbox', { name: 'Show on profile' }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show on profile' }));
  await waitFor(() => expect(f.api.setConnectionVisibility).toHaveBeenCalledWith('github', true));
  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
  await waitFor(() => expect(f.api.deleteConnection).toHaveBeenCalledWith('github'));
});
it('rejects an unexpected authorization host', async () => {
  f.api.connections.mockResolvedValue([]);
  f.api.authorizeGithubConnection.mockResolvedValue({ url: 'https://example.com/steal' });
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Unexpected authorization address');
  expect(f.open).not.toHaveBeenCalled();
});

it('refreshes the public profile after hiding a connection', async () => {
  let visible = true;
  const item = { provider: 'github', account_id: '1', name: 'alice', visible: true };
  f.api.connections.mockImplementation(async () => [{ ...item, visible }]);
  f.api.userConnections.mockImplementation(async () => visible ? [item] : []);
  f.api.user.mockResolvedValue({ id: '1', username: 'alice', global_name: 'Alice', avatar: null });
  f.api.setConnectionVisibility.mockImplementation(async (_provider: string, value: boolean) => { visible = value; });
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Screen() {
    const [open, setOpen] = useState(true);
    return <><LinkedAccounts /><button onClick={() => setOpen(!open)}>{open ? 'Close profile' : 'Open profile'}</button>{open && <ProfileDialog userId="1" guildId={null} />}</>;
  }
  render(<QueryClientProvider client={query}><Screen /></QueryClientProvider>);
  expect(await screen.findByText('GitHub: alice')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close profile' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Show on profile' }));
  await waitFor(() => expect(f.api.setConnectionVisibility).toHaveBeenCalledWith('github', false));
  await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Show on profile' }) as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  expect(screen.queryByText('GitHub: alice')).toBeNull();
  await waitFor(() => expect(f.api.userConnections).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('GitHub: alice')).toBeNull();
});
