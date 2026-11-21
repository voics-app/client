// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Permission } from '@discordy/core/contracts/permissions';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { LocaleProvider } from '@renderer/interface/shared/i18n';
import { PermissionMatrix } from '@renderer/interface/features/settings/server/RolesEditor';
import { ServerMembers } from '@renderer/interface/features/settings/server/ServerTabs';

const api = vi.hoisted(() => ({ kickMember: vi.fn(), ban: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api }) }));
const member = (id: string) => ({ user: { id, username: id, global_name: null, avatar: null }, roles: [], joined_at: '2026-11-01T12:00:00Z', deaf: false, mute: false });
beforeEach(() => {
  vi.resetAllMocks();
  useSessionStore.getState().reset();
  useSessionStore.getState().setUser(member('owner').user);
  useSessionStore.getState().setSettings({ locale: 'nl' });
  useGuildStore.setState({ guilds: { guild: { id: 'guild', name: 'Original server', owner_id: 'owner', roles: [], emojis: [] } } as never, members: { guild: { owner: member('owner'), OriginalAda: member('OriginalAda') } } });
  useUiStore.setState({ dialog: null, toasts: [] });
});
afterEach(cleanup);

it('searches translated permission labels and sends the original permission bit across a locale change', () => {
  const onToggle = vi.fn();
  const view = render(<LocaleProvider><PermissionMatrix value="0" query="berichten versturen" onToggle={onToggle} /></LocaleProvider>);
  fireEvent.click(screen.getByRole('switch', { name: 'Berichten versturen' }));
  expect(onToggle).toHaveBeenCalledWith(Permission.SEND_MESSAGES, true);
  act(() => useSessionStore.getState().setSettings({ locale: 'en-US' }));
  view.rerender(<LocaleProvider><PermissionMatrix value={String(Permission.SEND_MESSAGES)} query="Send messages" onToggle={onToggle} /></LocaleProvider>);
  expect(screen.getByRole('switch', { name: 'Send messages' }).getAttribute('aria-checked')).toBe('true');
});

it.each([
  { label: 'Verwijderen', method: 'kickMember' as const },
  { label: 'Verbannen', method: 'ban' as const },
])('keeps the $method action and original user ID behind its Dutch bulk label', async ({ label, method }) => {
  render(<LocaleProvider><ServerMembers guildId="guild" /></LocaleProvider>);
  fireEvent.click(screen.getByRole('checkbox', { name: 'OriginalAda selecteren' }));
  const bulkBar = screen.getByRole('status');
  const button = [...bulkBar.querySelectorAll('button')].find((item) => item.textContent === label)!;
  expect(button).toBeTruthy();
  fireEvent.click(button);
  const dialog = useUiStore.getState().dialog;
  expect(dialog?.kind).toBe('confirm');
  if (dialog?.kind !== 'confirm') throw new Error('Missing confirmation');
  expect(dialog.title).toBe(`1 lid ${method === 'ban' ? 'verbannen' : 'verwijderen'}?`);
  await act(() => dialog.onConfirm());
  expect(api[method]).toHaveBeenCalledWith('guild', 'OriginalAda');
  expect(api[method === 'ban' ? 'kickMember' : 'ban']).not.toHaveBeenCalled();
});
