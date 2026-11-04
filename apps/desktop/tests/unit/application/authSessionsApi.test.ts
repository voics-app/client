import { describe, expect, it, vi } from 'vitest';
import { DiscordyApi } from '@discordy/core/infrastructure/http/discordyApi';
import type { HttpClient } from '@discordy/core/infrastructure/http/httpClient';

describe('login session endpoints', () => {
  const fake = () => {
    const request = vi.fn(async () => undefined);
    return { api: new DiscordyApi({ request } as unknown as HttpClient), request };
  };

  it('lists, revokes one and logs out the others', async () => {
    const { api, request } = fake();
    await api.listSessions();
    await api.revokeSession('abc');
    await api.logoutOtherSessions();
    expect(request).toHaveBeenNthCalledWith(1, 'GET', '/users/@me/sessions', expect.anything());
    expect(request).toHaveBeenNthCalledWith(2, 'DELETE', '/users/@me/sessions/abc', expect.anything());
    expect(request).toHaveBeenNthCalledWith(3, 'POST', '/users/@me/sessions/logout-all', expect.anything());
  });
});
