import { describe, expect, it, vi } from 'vitest';
import { DiscordyApi } from '../../src/infrastructure/http/discordyApi';
import type { HttpClient } from '../../src/infrastructure/http/httpClient';

function fakeHttp() {
  const request = vi.fn(async () => undefined);
  return { http: { request } as unknown as HttpClient, request };
}

it('uses explicit consent and integration endpoints and never sends credentials in metadata edits', async () => {
  const { http, request } = fakeHttp();
  const api = new DiscordyApi(http);
  const invite = { client_id: '11', guild_id: '7', scope: 'bot', permissions: '2048' };
  await api.botAuthorizationInfo(invite);
  expect(request).toHaveBeenLastCalledWith('GET', '/oauth2/authorize', { query: invite });
  const submission = { ...invite, installation_revision: 'absent:0' };
  await api.authorizeBot(submission);
  expect(request).toHaveBeenLastCalledWith('POST', '/oauth2/authorize', { body: submission, reason: undefined });
  await api.applicationAuthorizations();
  expect(request).toHaveBeenLastCalledWith('GET', '/oauth2/tokens', { query: undefined });
  await api.revokeApplicationAuthorization('31');
  expect(request).toHaveBeenLastCalledWith('DELETE', '/oauth2/tokens/31', { reason: undefined });
  await api.guildIntegrations('7');
  expect(request).toHaveBeenLastCalledWith('GET', '/guilds/7/integrations', { query: undefined });
  await api.removeGuildIntegration('7', '11');
  expect(request).toHaveBeenLastCalledWith('DELETE', '/guilds/7/integrations/11', { reason: undefined });
  await api.guildWebhooks('7');
  expect(request).toHaveBeenLastCalledWith('GET', '/guilds/7/webhooks', { query: undefined });
  await api.followAnnouncement('2', '3');
  expect(request).toHaveBeenLastCalledWith('POST', '/channels/2/followers', { body: { webhook_channel_id: '3' }, reason: undefined });
  await api.publishAnnouncement('2', '9');
  expect(request).toHaveBeenLastCalledWith('POST', '/channels/2/messages/9/crosspost', { body: {}, reason: undefined });
  await api.followedChannels('7');
  expect(request).toHaveBeenLastCalledWith('GET', '/guilds/7/followed-channels', { query: undefined });
  await api.createWebhook('2', { name: 'Reminders' });
  expect(request).toHaveBeenLastCalledWith('POST', '/channels/2/webhooks', { body: { name: 'Reminders' }, reason: undefined });
  await api.updateWebhook('21', { avatar: null });
  expect(request).toHaveBeenLastCalledWith('PATCH', '/webhooks/21', { body: { avatar: null } });
  await api.resetWebhookToken('21');
  expect(request).toHaveBeenLastCalledWith('POST', '/webhooks/21/reset-token', { body: {}, reason: undefined });
  await api.deleteWebhook('21');
  expect(request).toHaveBeenLastCalledWith('DELETE', '/webhooks/21', { reason: undefined });
});

it('sends partial attachment metadata with explicit clear values', async () => {
  const { http, request } = fakeHttp();
  const patch = { attachments: [{ id: '7', description: null, flags: 0 }] };
  await new DiscordyApi(http).editMessage('12', '17', patch);
  expect(request).toHaveBeenCalledWith('PATCH', '/channels/12/messages/17', { body: patch });
});

describe('DiscordyApi permanent invitations', () => {
  it('uses the guild vanity route and sends explicit null when removing', async () => {
    const { http, request } = fakeHttp();
    const api = new DiscordyApi(http);
    await api.guildVanityUrl('7');
    expect(request).toHaveBeenLastCalledWith('GET', '/guilds/7/vanity-url', expect.anything());
    await api.updateGuildVanityUrl('7', 'Study-Club');
    expect(request).toHaveBeenLastCalledWith('PATCH', '/guilds/7/vanity-url', { body: { code: 'Study-Club' } });
    await api.updateGuildVanityUrl('7', null);
    expect(request).toHaveBeenLastCalledWith('PATCH', '/guilds/7/vanity-url', { body: { code: null } });
  });
});

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

describe('DiscordyApi push token', () => {
  it('registers the token of the session with POST /users/@me/devices/push', async () => {
    const { http, request } = fakeHttp();
    const body = { platform: 'apns', token: 'ab12', environment: 'sandbox', previews: false, only_mentions: true } as const;
    await new DiscordyApi(http).registerPushToken(body);
    expect(request).toHaveBeenCalledWith('POST', '/users/@me/devices/push', { body, reason: undefined });
  });

  it('removes it with DELETE /users/@me/devices/push', async () => {
    const { http, request } = fakeHttp();
    await new DiscordyApi(http).removePushToken();
    expect(request).toHaveBeenCalledWith('DELETE', '/users/@me/devices/push', { reason: undefined });
  });

  it('registers the VoIP token with POST /users/@me/devices/voip and removes it with DELETE', async () => {
    const { http, request } = fakeHttp();
    const body = { token: 'cd34', environment: 'sandbox' } as const;
    await new DiscordyApi(http).registerVoipToken(body);
    expect(request).toHaveBeenLastCalledWith('POST', '/users/@me/devices/voip', { body, reason: undefined });
    await new DiscordyApi(http).removeVoipToken();
    expect(request).toHaveBeenLastCalledWith('DELETE', '/users/@me/devices/voip', { reason: undefined });
  });
});
