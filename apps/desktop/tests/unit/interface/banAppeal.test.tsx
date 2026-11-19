// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { JoinGuildDialog } from '@renderer/interface/features/shell/DialogHost';

const api = vi.hoisted(() => ({ invite: vi.fn(), acceptInvite: vi.fn(), appealForm: vi.fn(), submitBanAppeal: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api }) }));

beforeEach(() => {
  vi.resetAllMocks();
  useGuildStore.setState({ guilds: {}, channels: {}, members: {} });
  api.invite.mockResolvedValue({ code: 'abcdef', guild: { id: '42', name: 'Example' } });
  api.acceptInvite.mockRejectedValue(new ApiError(403, 40007, 'You are banned'));
  api.appealForm.mockResolvedValue({ question: 'What changed?' });
  api.submitBanAppeal.mockResolvedValue({ id: '77' });
});
afterEach(cleanup);

it('offers and submits an appeal after an invite is rejected for a ban', async () => {
  render(<JoinGuildDialog initial="abcdef" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Accept invite' }));
  expect(await screen.findByText('You are banned')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'What changed?' }), { target: { value: 'I understand the rules.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit appeal' }));
  await waitFor(() => expect(api.submitBanAppeal).toHaveBeenCalledWith('42', 'I understand the rules.'));
  expect(await screen.findByText('Your appeal has been submitted.')).toBeTruthy();
});
