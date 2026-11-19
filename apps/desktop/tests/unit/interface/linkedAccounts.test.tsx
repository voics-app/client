// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LinkedAccounts } from '@renderer/interface/features/settings/user/LinkedAccounts';
const f = vi.hoisted(() => ({ api: { connections: vi.fn(), authorizeGithubConnection: vi.fn(), setConnectionVisibility: vi.fn(), deleteConnection: vi.fn() }, open: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: f.api }) }));
vi.mock('@renderer/interface/app/links', () => ({ openExternalUrl: f.open }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
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
