// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ServerRules } from '@renderer/interface/features/settings/server/ServerRules';

const fixture = vi.hoisted(() => ({
  memberVerification: vi.fn(async () => ({ enabled: false, rules: ['Existing rule'], revision: 1, pending: false })),
  setMemberVerification: vi.fn(async () => ({ enabled: true, rules: ['New rule'], revision: 2, pending: false })),
}));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: fixture }) }));
vi.mock('@renderer/interface/app/actions', () => ({ errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('loads, edits and saves screening rules', async () => {
  render(<ServerRules guildId="1" />);
  const field = await screen.findByLabelText('Rules, one per line');
  await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe('Existing rule'));
  fireEvent.change(field, { target: { value: 'New rule' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Require rule acceptance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
  await waitFor(() => expect(fixture.setMemberVerification).toHaveBeenCalledWith('1', { enabled: true, rules: ['New rule'] }));
  expect(await screen.findByText(/Rules saved/)).toBeTruthy();
});
