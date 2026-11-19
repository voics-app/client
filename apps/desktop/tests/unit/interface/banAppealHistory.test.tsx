// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BanAppeals } from '@renderer/interface/features/settings/server/ServerTabs';

vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: {
  appealForm: async () => ({ question: 'Why?' }),
  banAppeals: async () => [{ id: '1', user_id: '2', question: 'Why?', answer: 'Sorry', status: 'denied', created_at: '2026-01-01T00:00:00Z', resolved_at: '2026-01-02T00:00:00Z', resolved_by: '3' }],
} }) }));
afterEach(cleanup);

it('shows the decision and reviewer in appeal history', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BanAppeals guildId="42" /></QueryClientProvider>);
  expect(await screen.findByText('Status: denied - Reviewed by 3')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
});
