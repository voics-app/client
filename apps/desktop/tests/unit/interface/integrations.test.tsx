// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { ApplicationAuthorization, BotAuthorizationInfo, Channel, User, Webhook } from '@discordy/core/contracts/rest';
import { BotAuthorizeDialog } from '@renderer/interface/features/integrations/BotAuthorizeDialog';
import { AuthorizedApps } from '@renderer/interface/features/integrations/AuthorizedApps';
import { WebhookEditor } from '@renderer/interface/features/integrations/WebhookEditor';
import { ServerIntegrations } from '@renderer/interface/features/integrations/ServerIntegrations';

const fixture = vi.hoisted(() => ({ permissions: 0n, api: {
  botAuthorizationInfo: vi.fn(), authorizeBot: vi.fn(), applicationAuthorizations: vi.fn(), revokeApplicationAuthorization: vi.fn(), applications: vi.fn(),
  guildIntegrations: vi.fn(), removeGuildIntegration: vi.fn(), guildWebhooks: vi.fn(), createWebhook: vi.fn(), updateWebhook: vi.fn(), resetWebhookToken: vi.fn(), deleteWebhook: vi.fn(),
}, copyText: vi.fn(), openGuild: vi.fn(), readImageUpload: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: fixture.api }) }));
vi.mock('@renderer/interface/app/navigation', () => ({ openGuild: fixture.openGuild }));
vi.mock('@renderer/interface/app/actions', () => ({ copyText: fixture.copyText, errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error) }));
vi.mock('@renderer/interface/shared/hooks/usePermissions', () => ({ useGuildPermissions: () => fixture.permissions }));
vi.mock('@renderer/interface/features/settings/imageUpload', () => ({ readImageUpload: fixture.readImageUpload }));

const app = { id: '11', name: 'Study helper', icon: null, description: 'Study reminders' };
const info: BotAuthorizationInfo = { application: app, user: { id: '7', username: 'Sam' } as User, guilds: [{ id: '1', name: 'Study club', icon: null, permissions: '8', bot_permissions: null }], scopes: ['bot', 'applications.commands'], permissions: '2048' };
const invite = { client_id: '11', scope: 'bot applications.commands', permissions: '2048', guild_id: '1' };
const hook: Webhook = { id: '21', type: 1, guild_id: '1', channel_id: '2', name: 'Reminders', avatar: null, application_id: null };
const channels = [{ id: '2', guild_id: '1', name: 'general', type: 0 }] as Channel[];
const grant: ApplicationAuthorization = { id: '31', application: app, guild: { id: '1', name: 'Study club', icon: null }, scopes: ['bot'], permissions: '2048', created_at: '2026-11-18T00:00:00Z', authorized_at: '2026-11-18T00:00:00Z' };

function mount(element: React.ReactNode) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rendered = render(<QueryClientProvider client={query}>{element}</QueryClientProvider>);
  return { query, ...rendered };
}
beforeEach(() => {
  vi.resetAllMocks(); fixture.permissions = 0n;
  useSessionStore.setState({ user: { id: '7', username: 'Sam' } as User });
  useUiStore.setState({ dialog: null, settings: null });
  fixture.api.botAuthorizationInfo.mockResolvedValue(info);
  fixture.api.authorizeBot.mockResolvedValue({ location: '/channels/1' });
  fixture.api.applicationAuthorizations.mockResolvedValue([grant]);
  fixture.api.guildIntegrations.mockResolvedValue([]); fixture.api.guildWebhooks.mockResolvedValue([]);
});
afterEach(cleanup);

describe('bot consent', () => {
  it('requires explicit review, retains the server after failure and authorizes on retry', async () => {
    fixture.api.authorizeBot.mockRejectedValueOnce(new Error('Try again after reviewing the changed installation.'));
    mount(<BotAuthorizeDialog request={invite} />);
    const confirm = await screen.findByRole('checkbox', { name: 'I have reviewed these permissions.' });
    expect((screen.getByRole('button', { name: 'Authorize' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm); fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not authorize');
    expect((screen.getByLabelText('Server') as HTMLSelectElement).value).toBe('1');
    await waitFor(() => expect(fixture.api.botAuthorizationInfo).toHaveBeenCalledTimes(2));
    fireEvent.click(confirm); fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
    await waitFor(() => expect(fixture.openGuild).toHaveBeenCalledWith('1'));
    expect(fixture.api.authorizeBot).toHaveBeenLastCalledWith(invite);
  });
  it('shows existing effective permissions and cancelling never authorizes', async () => {
    fixture.api.botAuthorizationInfo.mockResolvedValue({ ...info, guilds: [{ ...info.guilds[0], bot_permissions: '8' }] });
    mount(<BotAuthorizeDialog request={invite} />);
    expect(await screen.findByText('Administrator — all permissions, bypassing channel restrictions')).toBeTruthy();
    expect(screen.getByText(/already installed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.api.authorizeBot).not.toHaveBeenCalled();
  });
  it('submits the effective permissions the user reviewed for an installed bot', async () => {
    fixture.api.botAuthorizationInfo.mockResolvedValue({ ...info, guilds: [{ ...info.guilds[0], bot_permissions: '8' }] });
    mount(<BotAuthorizeDialog request={invite} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'I have reviewed these permissions.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record consent' }));
    await waitFor(() => expect(fixture.api.authorizeBot).toHaveBeenCalledWith({ ...invite, permissions: '8' }));
  });
  it('exposes load errors and a retry without presenting an empty success', async () => {
    fixture.api.botAuthorizationInfo.mockRejectedValueOnce(new Error('Application unavailable'));
    mount(<BotAuthorizeDialog request={invite} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Application unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox')).toBeTruthy();
  });
});

describe('personal authorizations', () => {
  it('reads actual consents and revokes only a record with explicit shared-bot wording', async () => {
    fixture.api.revokeApplicationAuthorization.mockImplementation(async () => { fixture.api.applicationAuthorizations.mockResolvedValue([]); });
    mount(<AuthorizedApps />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke consent' }));
    const dialog = useUiStore.getState().dialog;
    expect(dialog?.kind).toBe('confirm');
    if (dialog?.kind !== 'confirm') throw new Error('missing confirmation');
    expect(dialog.body).toContain('shared bot stays installed');
    await act(async () => dialog.onConfirm());
    expect(await screen.findByText('No authorized apps')).toBeTruthy();
    expect(fixture.api.revokeApplicationAuthorization).toHaveBeenCalledWith('31');
    expect(fixture.api.applications).not.toHaveBeenCalled();
    expect(fixture.api.removeGuildIntegration).not.toHaveBeenCalled();
  });
});

describe('webhook editing', () => {
  it('preserves a failed edit and sends only changed metadata', async () => {
    fixture.api.updateWebhook.mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValue({ ...hook, name: 'Announcements' });
    mount(<WebhookEditor guildId="1" initial={hook} channels={channels} canAudit onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Webhook name'), { target: { value: 'Announcements' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save webhook' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Temporary failure');
    expect((screen.getByLabelText('Webhook name') as HTMLInputElement).value).toBe('Announcements');
    expect(useUnsavedStore.getState().requestLeave()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save webhook' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fixture.api.updateWebhook).toHaveBeenLastCalledWith('21', { name: 'Announcements' });
  });
  it('copies a creation URL without placing credentials in the query cache and hides them on unmount', async () => {
    const url = 'https://example.invalid/api/v1/webhooks/21/synthetic-test-only';
    fixture.api.createWebhook.mockResolvedValue({ ...hook, token: 'synthetic-test-only', url });
    const mounted = mount(<WebhookEditor guildId="1" initial={null} channels={channels} canAudit onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Webhook name'), { target: { value: 'Reminders' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create webhook' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy URL' }));
    expect(fixture.copyText).toHaveBeenCalledWith(url, 'Webhook URL copied');
    expect(JSON.stringify(mounted.query.getQueryCache().getAll())).not.toContain('synthetic-test-only');
    mounted.unmount();
    mount(<WebhookEditor guildId="1" initial={hook} channels={channels} canAudit onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText('Webhook execution URL')).toBeNull();
  });
  it('confirms regeneration, supports Hide URL, and targets the webhook audit filter', async () => {
    fixture.api.resetWebhookToken.mockResolvedValue({ ...hook, token: 'synthetic-new', url: 'https://example.invalid/new' });
    mount(<WebhookEditor guildId="1" initial={hook} channels={channels} canAudit onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate URL' }));
    const dialog = useUiStore.getState().dialog;
    if (dialog?.kind !== 'confirm') throw new Error('missing confirmation');
    expect(dialog.body).toContain('old URL stops working immediately');
    expect(fixture.api.resetWebhookToken).not.toHaveBeenCalled();
    await act(async () => dialog.onConfirm());
    fireEvent.click(await screen.findByRole('button', { name: 'Hide URL' }));
    expect(screen.queryByLabelText('Webhook execution URL')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View audit log' }));
    expect(useUiStore.getState().settings).toEqual({ kind: 'server', guildId: '1', tab: 'audit', auditTarget: { id: '21', name: 'Reminders' } });
  });
  it('shows image-reading errors next to the upload control', async () => {
    fixture.readImageUpload.mockRejectedValue(new Error('Images must be 10 MB or smaller.'));
    mount(<WebhookEditor guildId="1" initial={hook} channels={channels} canAudit={false} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Webhook avatar'), { target: { files: [new File(['test'], 'large.png', { type: 'image/png' })] } });
    expect((await screen.findByRole('alert')).textContent).toContain('10 MB');
    expect(fixture.api.updateWebhook).not.toHaveBeenCalled();
  });
});

it('gates installed apps and webhooks independently and does not call unauthorized routes', async () => {
  fixture.permissions = Permission.MANAGE_GUILD;
  const first = mount(<ServerIntegrations guildId="1" />);
  await waitFor(() => expect(fixture.api.guildIntegrations).toHaveBeenCalledWith('1'));
  expect(fixture.api.guildWebhooks).not.toHaveBeenCalled(); first.unmount();
  fixture.permissions = Permission.MANAGE_WEBHOOKS;
  fixture.api.guildIntegrations.mockClear();
  mount(<ServerIntegrations guildId="1" />);
  await waitFor(() => expect(fixture.api.guildWebhooks).toHaveBeenCalledWith('1'));
  expect(fixture.api.guildIntegrations).not.toHaveBeenCalled();
});
