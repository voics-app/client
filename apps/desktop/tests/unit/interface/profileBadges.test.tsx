// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let badges = [{ id: 'fixture_one', visible: true }, { id: 'fixture_two', visible: true }];
const ownBadges = vi.fn(async () => badges);
const setBadgeVisibility = vi.fn(async (id: string, visible: boolean) => {
  badges = badges.map((badge) => badge.id === id ? { ...badge, visible } : badge);
});
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { ownBadges, setBadgeVisibility } }) }));
import { ProfileBadges } from '@renderer/interface/features/settings/user/ProfileBadges';

beforeEach(() => {
  badges = [{ id: 'fixture_one', visible: true }, { id: 'fixture_two', visible: true }];
  vi.clearAllMocks();
});
afterEach(cleanup);

it('changes only the selected badge and refreshes the owner view', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProfileBadges userId="42" /></QueryClientProvider>);
  const first = await screen.findByRole('switch', { name: 'Show fixture_one on your profile' });
  expect(first.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(first);
  await waitFor(() => expect(first.getAttribute('aria-checked')).toBe('false'));
  expect(setBadgeVisibility).toHaveBeenCalledWith('fixture_one', false);
  expect(screen.getByRole('switch', { name: 'Show fixture_two on your profile' }).getAttribute('aria-checked')).toBe('true');
});
