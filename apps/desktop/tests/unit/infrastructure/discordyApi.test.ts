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

describe('DiscordyApi server templates', () => {
  it('lists and resolves templates', async () => {
    const { http, request } = fakeHttp();
    const api = new DiscordyApi(http);
    await api.builtinGuildTemplates();
    expect(request).toHaveBeenLastCalledWith('GET', '/guilds/templates', expect.anything());
    await api.guildTemplate('builtin-gaming');
    expect(request).toHaveBeenLastCalledWith('GET', '/guilds/templates/builtin-gaming', expect.anything());
  });

  it('creates a guild from a template with POST /guilds/templates/{code}', async () => {
    const { http, request } = fakeHttp();
    await new DiscordyApi(http).createGuildFromTemplate('abc', { name: 'Hub' });
    expect(request).toHaveBeenCalledWith('POST', '/guilds/templates/abc', { body: { name: 'Hub' }, reason: undefined });
  });

  it('manages a guild template', async () => {
    const { http, request } = fakeHttp();
    const api = new DiscordyApi(http);
    await api.createGuildTemplate('7', { name: 'T' });
    expect(request).toHaveBeenLastCalledWith('POST', '/guilds/7/templates', { body: { name: 'T' }, reason: undefined });
    await api.modifyGuildTemplate('7', 'abc', { description: null });
    expect(request).toHaveBeenLastCalledWith('PATCH', '/guilds/7/templates/abc', { body: { description: null } });
    await api.syncGuildTemplate('7', 'abc');
    expect(request).toHaveBeenLastCalledWith('PUT', '/guilds/7/templates/abc', { body: undefined, reason: undefined });
    await api.deleteGuildTemplate('7', 'abc');
    expect(request).toHaveBeenLastCalledWith('DELETE', '/guilds/7/templates/abc', expect.anything());
  });
});
