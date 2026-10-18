import { describe, expect, it, vi } from 'vitest';
import { DiscordyApi } from '@renderer/infrastructure/http/discordyApi';
import type { HttpClient } from '@renderer/infrastructure/http/httpClient';

function fakeHttp() {
  const request = vi.fn(async () => undefined);
  return { http: { request } as unknown as HttpClient, request };
}

describe('DiscordyApi relationships', () => {
  it('sends a friend request by username with POST /users/@me/relationships', async () => {
    const { http, request } = fakeHttp();
    await new DiscordyApi(http).sendFriendRequest('bob');
    expect(request).toHaveBeenCalledWith('POST', '/users/@me/relationships', { body: { username: 'bob' }, reason: undefined });
  });

  it('accepts a request by user id with PUT /users/@me/relationships/{id}', async () => {
    const { http, request } = fakeHttp();
    await new DiscordyApi(http).putRelationship('123');
    expect(request).toHaveBeenCalledWith('PUT', '/users/@me/relationships/123', { body: {}, reason: undefined });
  });
});
