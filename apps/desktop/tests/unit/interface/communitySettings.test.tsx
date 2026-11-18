// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerVanity } from '@renderer/interface/features/settings/server/ServerVanity';
import { ServerAuditPolicy } from '@renderer/interface/features/settings/server/ServerAuditPolicy';

const fixture = vi.hoisted(() => ({
  permissions: 40n,
  api: { guildVanityUrl: vi.fn(), updateGuildVanityUrl: vi.fn(), guild: vi.fn(), updateGuild: vi.fn() },
  copyText: vi.fn(),
}));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: fixture.api }) }));
vi.mock('@renderer/interface/app/actions', () => ({ copyText: fixture.copyText, errorMessage: (error: unknown) => String(error instanceof Error ? error.message : error) }));
vi.mock('@renderer/interface/shared/hooks/usePermissions', () => ({
  useGuildPermissions: () => fixture.permissions,
  can: (permissions: bigint, bit: bigint) => (permissions & bit) === bit,
}));

function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.permissions = 40n;
  fixture.api.guildVanityUrl.mockResolvedValue({ code: null, uses: 0 });
  fixture.api.guild.mockResolvedValue({ id: '1', audit_log_enabled: true, audit_log_retention_days: 90 });
});
afterEach(cleanup);

describe('permanent invite settings', () => {
  it('saves the server-normalized code, copies its link and removes it', async () => {
    fixture.api.updateGuildVanityUrl.mockResolvedValueOnce({ code: 'study-club', uses: 0 }).mockResolvedValueOnce({ code: null, uses: 0 });
    mount(<ServerVanity guildId="1" />);
    fireEvent.change(await screen.findByLabelText('Invite code'), { target: { value: 'Study-Club' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save invite' }));
    await waitFor(() => expect(fixture.api.updateGuildVanityUrl).toHaveBeenCalledWith('1', 'Study-Club'));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy invite link' }));
    expect(fixture.copyText).toHaveBeenCalledWith(expect.stringContaining('/invite/study-club'), 'Invite link copied');
    fireEvent.click(screen.getByRole('button', { name: 'Remove invite' }));
    await waitFor(() => expect(fixture.api.updateGuildVanityUrl).toHaveBeenLastCalledWith('1', null));
    await screen.findByText('No permanent invitation is set.');
  });

  it('keeps an unavailable code editable and exposes a retryable error', async () => {
    fixture.api.updateGuildVanityUrl.mockRejectedValueOnce(Object.assign(new Error('Invalid Form Body'), {
      errors: { code: { _errors: [{ code: 'VANITY_CODE_UNAVAILABLE', message: 'This invitation code is already in use.' }] } },
    }));
    mount(<ServerVanity guildId="1" />);
    const input = await screen.findByLabelText('Invite code');
    fireEvent.change(input, { target: { value: 'taken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save invite' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already in use');
    expect((input as HTMLInputElement).value).toBe('taken');
  });

  it('does not fetch or expose management to members without permission', () => {
    fixture.permissions = 0n;
    mount(<ServerVanity guildId="1" />);
    expect(screen.queryByLabelText('Invite code')).toBeNull();
    expect(fixture.api.guildVanityUrl).not.toHaveBeenCalled();
  });
});

describe('audit settings', () => {
  it('saves disabled logging and retention together and refreshes the log', async () => {
    fixture.api.updateGuild.mockResolvedValue({ id: '1', audit_log_enabled: false, audit_log_retention_days: 30 });
    const client = mount(<ServerAuditPolicy guildId="1" />);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(await screen.findByRole('switch', { name: 'Record audit log' }));
    fireEvent.change(screen.getByLabelText('Keep audit entries'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save audit settings' }));
    await waitFor(() => expect(fixture.api.updateGuild).toHaveBeenCalledWith('1', { audit_log_enabled: false, audit_log_retention_days: 30 }));
    await screen.findByText('Audit settings saved.');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guild', '1', 'audit'] });
    expect(screen.getByText(/Audit logging is off/)).toBeTruthy();
  });

  it('allows audit readers to inspect the policy without changing it', async () => {
    fixture.permissions = 128n;
    mount(<ServerAuditPolicy guildId="1" />);
    expect((await screen.findByRole('switch', { name: 'Record audit log' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Keep audit entries') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save audit settings' })).toBeNull();
  });

  it('retains unsaved choices when the server rejects the save', async () => {
    fixture.api.updateGuild.mockRejectedValueOnce(new Error('Missing permissions.'));
    mount(<ServerAuditPolicy guildId="1" />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Record audit log' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save audit settings' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Missing permissions');
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('Audit settings saved.')).toBeNull();
  });
});
