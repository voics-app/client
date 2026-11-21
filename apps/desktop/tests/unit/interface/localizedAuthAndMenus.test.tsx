// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useAuthLinkStore } from '@discordy/core/application/stores/authLinkStore';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { buildMessageMenu } from '@discordy/core/domain/messageMenuModel';
import { createI18n } from '@discordy/core/domain/i18n';
import { LocaleProvider } from '@renderer/interface/shared/i18n';
import { AuthScreen } from '@renderer/interface/features/auth/AuthScreen';
import { toMenuEntries } from '@renderer/interface/shared/ui/menuAdapter';
import type { MenuEntry } from '@renderer/interface/shared/ui/Menu';

const session = vi.hoisted(() => ({ login: vi.fn(), loginMfa: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ session }) }));
vi.mock('@renderer/interface/app/passkeys', () => ({ usePasskeySite: () => null, performPasskey: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  useSessionStore.getState().reset();
  useSessionStore.getState().setSettings({ locale: 'nl' });
  useAuthLinkStore.setState({ link: null });
});
afterEach(cleanup);

it('keeps typed credentials across a locale change and completes the Dutch MFA step with original values', async () => {
  session.login.mockRejectedValueOnce(new ApiError(400, 60008, 'MFA required', undefined, 'original-ticket', ['totp']));
  session.loginMfa.mockResolvedValueOnce(undefined);
  render(<LocaleProvider><AuthScreen /></LocaleProvider>);
  fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'original@example.test' } });
  fireEvent.change(screen.getByLabelText('Wachtwoord'), { target: { value: 'password-مرحبا' } });
  act(() => useSessionStore.getState().setSettings({ locale: 'en-US' }));
  expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('password-مرحبا');
  act(() => useSessionStore.getState().setSettings({ locale: 'nl' }));
  fireEvent.submit(screen.getByLabelText('Wachtwoord').closest('form')!);
  const code = await screen.findByLabelText('Authenticator- of herstelcode');
  expect(session.login).toHaveBeenCalledWith({ email: 'original@example.test', password: 'password-مرحبا' });
  expect(screen.getByRole('heading', { name: 'Bevestig je aanmelding' })).toBeTruthy();
  fireEvent.change(code, { target: { value: '123456' } });
  fireEvent.submit(code.closest('form')!);
  await waitFor(() => expect(session.loginMfa).toHaveBeenCalledWith({ ticket: 'original-ticket', code: '123456' }));
});

it('translates menu actions while preserving emoji and installed command names that look like English UI copy', () => {
  const run = vi.fn();
  const model = buildMessageMenu({ isMine: true, standard: true, canReact: true, canManageMessages: true, canCreateThread: false, forwardSupported: true, canSpeak: false, hasText: true, pinned: false, selection: '', canAddEmoji: false, quick: [{ id: 'emoji', name: 'Delete', animated: false }], appCommands: [{ id: 'cmd', applicationId: 'app', appName: 'Copy', name: 'Delete', kind: 'message' }] }, { kind: 'message' });
  const entries = toMenuEntries(model, run, {}, createI18n('nl'));
  const flatten = (items: MenuEntry[]): MenuEntry[] => items.flatMap((entry) => entry.kind === 'submenu' ? [entry, ...flatten(entry.entries)] : [entry]);
  const all = flatten(entries);
  expect(all.some((entry) => entry.kind === 'item' && entry.label === 'Bericht bewerken')).toBe(true);
  const literal = all.filter((entry) => entry.kind === 'item' && entry.label === 'Delete');
  expect(literal).toHaveLength(2);
  for (const entry of literal) if (entry.kind === 'item') entry.onSelect();
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ id: 'react', arg: 'Delete:emoji' }));
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ id: 'appCommand', arg: 'cmd' }));
});
