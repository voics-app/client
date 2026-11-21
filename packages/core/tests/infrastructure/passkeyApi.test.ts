import { describe, expect, it, vi } from 'vitest';
import { DiscordyApi } from '../../src/infrastructure/http/discordyApi';
import { ApiError, HttpClient } from '../../src/infrastructure/http/httpClient';
import { SessionManager, type SessionRuntime } from '../../src/application/sessionManager';

describe('passkey transport and session adoption', () => {
  it('preserves advertised MFA methods and filters invalid values', async () => {
    const http = new HttpClient({ baseUrl: 'https://api.test', fetch: async () => new Response(JSON.stringify({ code: 60008, ticket: 'ticket', methods: ['webauthn', null, 'backup_code'] }), { status: 401 }), tokens: { access: () => null, refresh: async () => null, expired: vi.fn() } });
    const error = await new DiscordyApi(http).login({ email: 'test@example.test', password: 'password' }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).methods).toEqual(['webauthn', 'backup_code']);
  });

  it('uses the public ticket endpoints without bearer auth and sends removal confirmation in the body', async () => {
    const request = vi.fn(async () => undefined);
    const api = new DiscordyApi({ request } as unknown as HttpClient);
    const finish = { ticket: 'ticket', challenge_id: 'challenge', credential: { id: 'credential' } };
    await api.startPasskeyLogin('ticket');
    await api.finishPasskeyLogin(finish);
    await api.removePasskey('key/id', 'password', 'backup-code');
    expect(request.mock.calls).toEqual([
      ['POST', '/auth/mfa/webauthn/start', { auth: false, body: { ticket: 'ticket' } }],
      ['POST', '/auth/mfa/webauthn/finish', { auth: false, body: finish }],
      ['DELETE', '/users/@me/mfa/passkeys/key%2Fid', { body: { password: 'password', code: 'backup-code' } }],
    ]);
  });

  it('persists and connects only after successful server verification', async () => {
    const user = { id: 'u', username: 'Ada', global_name: null, avatar: null };
    const finishPasskeyLogin = vi.fn().mockRejectedValueOnce(new Error('Invalid signature')).mockResolvedValueOnce({ user, access_token: 'access', refresh_token: 'refresh' });
    const runtime = { api: { finishPasskeyLogin }, connect: vi.fn(), disconnect: vi.fn(), setTokens: vi.fn(), renewSession: vi.fn() } as unknown as SessionRuntime;
    const vault = { load: vi.fn(), save: vi.fn(), clear: vi.fn() };
    const manager = new SessionManager({ runtime, vault, identity: async () => null });
    const body = { ticket: 'ticket', challenge_id: 'challenge', credential: { id: 'key' } };
    await expect(manager.loginPasskey(body)).rejects.toThrow('Invalid signature');
    expect(vault.save).not.toHaveBeenCalled();
    expect(runtime.connect).not.toHaveBeenCalled();
    await manager.loginPasskey(body);
    expect(vault.save).toHaveBeenCalledWith({ userId: 'u', accessToken: 'access', refreshToken: 'refresh', deviceId: null });
    expect(runtime.connect).toHaveBeenCalledOnce();
  });
});
