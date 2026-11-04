import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backupCodesFile,
  confirmationMatches,
  groupSecret,
  looksLikeSecondFactor,
  newPasswordProblem,
} from '@discordy/core/domain/accountSecurity';
import { SessionManager, type SessionRuntime, type SessionVault } from '@renderer/application/sessionManager';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { DiscordyApi } from '@renderer/infrastructure/http/discordyApi';
import { ApiError, HttpClient } from '@renderer/infrastructure/http/httpClient';

describe('account security rules', () => {
  it('rejects short, long and mismatched new passwords', () => {
    expect(newPasswordProblem('short', 'short')).toMatch(/at least 8/);
    expect(newPasswordProblem('x'.repeat(129), 'x'.repeat(129))).toMatch(/at most 128/);
    expect(newPasswordProblem('long-enough-1', 'long-enough-2')).toMatch(/do not match/);
    expect(newPasswordProblem('long-enough-1', 'long-enough-1')).toBeNull();
  });

  it('needs the username typed back to confirm deletion', () => {
    expect(confirmationMatches(' Ada ', 'ada')).toBe(true);
    expect(confirmationMatches('adam', 'ada')).toBe(false);
    expect(confirmationMatches('', '')).toBe(false);
  });

  it('accepts authenticator and backup code shapes only', () => {
    expect(looksLikeSecondFactor('123456')).toBe(true);
    expect(looksLikeSecondFactor('abcde-fghij')).toBe(true);
    expect(looksLikeSecondFactor('ABCDEFGHIJ')).toBe(true);
    expect(looksLikeSecondFactor('12345')).toBe(false);
    expect(looksLikeSecondFactor('abcde-fghi!')).toBe(false);
  });

  it('formats the download with every code on its own line', () => {
    const file = backupCodesFile(['aaaaa-bbbbb', 'ccccc-ddddd'], 'ada', 'Discordy');
    expect(file.split('\n')).toEqual(expect.arrayContaining(['aaaaa-bbbbb', 'ccccc-ddddd']));
    expect(file).toContain('ada');
  });

  it('groups a secret in fours', () => {
    expect(groupSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});

describe('login with a second factor', () => {
  it('keeps the ticket of a 60008 answer on the ApiError', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ code: 60008, message: 'Two-factor authentication required', ticket: 'tkt' }), { status: 401 }));
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: fetchFn as unknown as typeof fetch, tokens: { access: () => null, refresh: async () => null, expired: vi.fn() } });
    const error = await client.request('POST', '/auth/login', { body: {}, auth: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(60008);
    expect((error as ApiError).ticket).toBe('tkt');
  });

  describe('SessionManager.loginMfa', () => {
    beforeEach(() => useSessionStore.getState().reset());
    it('exchanges the ticket and adopts the session', async () => {
      const user = { id: '1', username: 'ada', global_name: null, avatar: null };
      const vault: SessionVault = { load: vi.fn(async () => null), save: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) };
      const api = {
        loginMfa: vi.fn(async () => ({ access_token: 'a', refresh_token: 'r', user })),
        me: vi.fn(async () => user),
        registerDevice: vi.fn(async () => ({ device_id: 'd' })),
      };
      const runtime: SessionRuntime = { api: api as unknown as SessionRuntime['api'], connect: vi.fn(), disconnect: vi.fn(), setTokens: vi.fn() };
      await new SessionManager({ vault, runtime, identity: async () => null }).loginMfa({ ticket: 'tkt', code: '123456' });
      expect(api.loginMfa).toHaveBeenCalledWith({ ticket: 'tkt', code: '123456' });
      expect(runtime.setTokens).toHaveBeenLastCalledWith({ access: 'a', refresh: 'r' });
      expect(runtime.connect).toHaveBeenCalled();
    });
  });
});

describe('account routes', () => {
  function fake() {
    const request = vi.fn(async () => ({ backup_codes: [{ code: 'aaaaa-bbbbb', consumed: false }] }));
    return { api: new DiscordyApi({ request } as unknown as HttpClient), request };
  }

  it('sends the sensitive PATCH with the current password', async () => {
    const { api, request } = fake();
    await api.changeAccount({ new_password: 'new-passphrase', password: 'old' });
    expect(request).toHaveBeenCalledWith('PATCH', '/users/@me', { body: { new_password: 'new-passphrase', password: 'old' } });
  });

  it('unwraps backup codes from verify and codes-verification', async () => {
    const { api, request } = fake();
    expect(await api.verifyTotp('123456')).toEqual([{ code: 'aaaaa-bbbbb', consumed: false }]);
    expect(request).toHaveBeenCalledWith('POST', '/users/@me/mfa/totp/verify', { body: { code: '123456' }, reason: undefined });
    await api.backupCodes('pw', true);
    expect(request).toHaveBeenLastCalledWith('POST', '/users/@me/mfa/codes-verification', { body: { password: 'pw', regenerate: true }, reason: undefined });
  });

  it('calls the public recovery routes without auth', async () => {
    const { api, request } = fake();
    await api.forgotPassword('a@b.c');
    await api.resetPassword('tok', 'new-passphrase');
    await api.loginMfa({ ticket: 't', code: 'c' });
    expect(request).toHaveBeenCalledWith('POST', '/auth/forgot-password', { body: { email: 'a@b.c' }, auth: false });
    expect(request).toHaveBeenCalledWith('POST', '/auth/reset-password', { body: { token: 'tok', password: 'new-passphrase' }, auth: false });
    expect(request).toHaveBeenCalledWith('POST', '/auth/mfa/totp', { body: { ticket: 't', code: 'c' }, auth: false });
  });
});
