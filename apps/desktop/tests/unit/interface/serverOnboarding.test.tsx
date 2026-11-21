// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ServerOnboarding } from '@renderer/interface/features/settings/server/ServerOnboarding';

const fixture = vi.hoisted(() => ({
  onboarding: vi.fn(async () => ({ revision: 2, config: { enabled: true, questions: [{ title: 'Interests?', options: [{ label: 'Chat', role_id: null, channel_id: null }] }] } })),
  setOnboarding: vi.fn(async () => undefined),
  state: { guilds: { '1': { roles: [{ id: '3', name: 'Reader', managed: false }] } }, channels: { '4': { id: '4', guild_id: '1', name: 'general' } } },
}));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: fixture }) }));
vi.mock('@renderer/interface/app/actions', () => ({ errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error) }));
vi.mock('@discordy/core/application/stores/guildStore', () => ({ useGuildStore: (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('loads choices and saves a selected role and channel', async () => {
  render(<ServerOnboarding guildId="1" />);
  const title = await screen.findByLabelText('Question');
  await waitFor(() => expect((title as HTMLInputElement).value).toBe('Interests?'));
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Suggested channel'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save onboarding' }));
  await waitFor(() => expect(fixture.setOnboarding).toHaveBeenCalledWith('1', { enabled: true, questions: [{ title: 'Interests?', options: [{ label: 'Chat', role_id: '3', channel_id: '4' }] }] }));
  expect(await screen.findByText('Onboarding saved.')).toBeTruthy();
});
