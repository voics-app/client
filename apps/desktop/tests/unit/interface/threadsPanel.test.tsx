// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ThreadsPanel } from '@renderer/interface/features/panels/ThreadsPanel';

const api = { listThreads: vi.fn() };
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api }) }));

beforeEach(() => {
  api.listThreads.mockReset();
  api.listThreads.mockImplementation(async (_id: string, archived: boolean) => archived
    ? [{ id: 'archived', name: 'Old plans', type: 11, parent_id: 'parent', delivery_mode: 'standard' }]
    : [{ id: 'active', name: 'New plans', type: 11, parent_id: 'parent', delivery_mode: 'standard', member_count: 2 }]);
  useGuildStore.setState({ channels: {} });
  useUiStore.setState({ sidePanel: null });
});
afterEach(cleanup);

it('browses active and archived threads, filters names and opens a thread', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ThreadsPanel channelId="parent" /></QueryClientProvider>);
  expect(await screen.findByText('New plans')).toBeTruthy();
  expect(screen.getByText('2 members')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Search threads'), { target: { value: 'missing' } });
  expect(screen.getByText('No matching threads')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Search threads'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
  expect(await screen.findByText('Old plans')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Old plans/ }));
  await waitFor(() => expect(useUiStore.getState().sidePanel).toEqual({ kind: 'thread', threadId: 'archived' }));
  expect(useGuildStore.getState().channels.archived?.name).toBe('Old plans');
});
