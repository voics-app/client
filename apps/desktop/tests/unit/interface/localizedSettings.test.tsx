// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { LocaleProvider } from '@renderer/interface/shared/i18n';
import { AccessibilityTab } from '@renderer/interface/features/settings/user/UserTabs';
import { AccountSecurity } from '@renderer/interface/features/settings/user/AccountSecurity';
import { searchSettings } from '@renderer/interface/features/settings/searchIndex';

const api = vi.hoisted(() => ({ me: vi.fn(), changeAccount: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api }) }));
vi.mock('@renderer/interface/features/settings/user/Passkeys', () => ({ Passkeys: () => null }));
const user = { id: 'me', username: 'OriginalAda', global_name: null, avatar: null };

beforeEach(() => {
  vi.resetAllMocks();
  api.me.mockResolvedValue(user);
  api.changeAccount.mockResolvedValue(user);
  useSessionStore.getState().reset();
  useSessionStore.getState().setUser(user);
  useSessionStore.getState().setSettings({ locale: 'nl' });
  usePrefsStore.getState().set('reduceMotion', false);
});
afterEach(cleanup);

it('finds a translated accessibility setting, changes its existing preference and keeps its row target on language change', () => {
  const { container } = render(<LocaleProvider><AccessibilityTab /></LocaleProvider>);
  const hit = searchSettings('Beweging verminderen', undefined, 12, 'nl')[0]!;
  const row = container.querySelector<HTMLElement>(`[data-row="${hit.rowId}"]`)!;
  fireEvent.click(within(row).getByRole('switch', { name: 'Beweging verminderen' }));
  expect(usePrefsStore.getState().reduceMotion).toBe(true);
  act(() => useSessionStore.getState().setSettings({ locale: 'en-US' }));
  expect(within(row).getByRole('switch', { name: 'Reduce motion' }).getAttribute('aria-checked')).toBe('true');
  expect(container.querySelector('[data-row="reduce-motion"]')).toBe(row);
});

it('validates Dutch password fields before submitting the original credential values', async () => {
  render(<LocaleProvider><AccountSecurity user={user} /></LocaleProvider>);
  const row = document.querySelector<HTMLElement>('[data-row="password"]')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Wijzigen' }));
  const dialog = await screen.findByRole('dialog', { name: 'Wachtwoord wijzigen' });
  fireEvent.change(within(dialog).getByLabelText('Nieuw wachtwoord'), { target: { value: 'short' } });
  fireEvent.change(within(dialog).getByLabelText('Nieuw wachtwoord bevestigen'), { target: { value: 'short' } });
  fireEvent.change(within(dialog).getByLabelText('Huidig wachtwoord'), { target: { value: 'original-old-password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Wachtwoord wijzigen' }));
  expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', 'Gebruik minstens 8 tekens.');
  expect(api.changeAccount).not.toHaveBeenCalled();
  fireEvent.change(within(dialog).getByLabelText('Nieuw wachtwoord'), { target: { value: 'original-new-password' } });
  fireEvent.change(within(dialog).getByLabelText('Nieuw wachtwoord bevestigen'), { target: { value: 'original-new-password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Wachtwoord wijzigen' }));
  expect(api.changeAccount).toHaveBeenCalledWith({ new_password: 'original-new-password', password: 'original-old-password' });
});
