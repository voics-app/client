import { describe, expect, it } from 'vitest';
import { DEFAULT_UPDATE_FEED_URL, PROFILES, resolveConnection, resolveUpdateFeed } from '../../../src/main/config';
import { routeFromDeepLink } from '../../../src/main/deepLinks';

describe('resolveConnection', () => {
  it('points the local profile at the dev stack on 127.0.0.1:18000', () => {
    expect(PROFILES.local.apiUrl).toBe('http://127.0.0.1:18000');
    expect(PROFILES.local.gatewayUrl).toBe('ws://127.0.0.1:18000');
    expect(PROFILES.local.cdnUrl).toBe('http://127.0.0.1:18000/cdn');
  });

  it('defaults to production endpoints', () => {
    expect(resolveConnection({}, null)).toEqual(PROFILES.production);
    expect(PROFILES.production.apiUrl).toBe('https://discordy-api.voics.nl');
    expect(PROFILES.production.gatewayUrl).toBe('wss://discordy-gateway.voics.nl');
  });

  it('DISCORDY_PROFILE=local resolves to the local profile', () => {
    expect(resolveConnection({ DISCORDY_PROFILE: 'local' }, null)).toEqual(PROFILES.local);
  });

  it('env overrides individual endpoints and win over persisted settings', () => {
    const resolved = resolveConnection(
      { DISCORDY_API_URL: 'http://127.0.0.1:9999/' },
      { id: 'local', apiUrl: 'http://x', gatewayUrl: 'ws://x', cdnUrl: 'http://x/cdn' },
    );
    expect(resolved.apiUrl).toBe('http://127.0.0.1:9999');
    expect(resolved.gatewayUrl).toBe('ws://x');
    expect(resolved.id).toBe('custom');
  });

  it('uses persisted settings when env is silent', () => {
    const persisted = { id: 'custom' as const, apiUrl: 'https://a', gatewayUrl: 'wss://g', cdnUrl: 'https://c' };
    expect(resolveConnection({}, persisted)).toEqual(persisted);
  });

  it('rejects non-http(s)/ws(s) URLs', () => {
    expect(() => resolveConnection({ DISCORDY_API_URL: 'file:///etc/passwd' }, null)).toThrow(/DISCORDY_API_URL/);
  });
});

describe('resolveUpdateFeed', () => {
  it('defaults to the Discordy update host', () => {
    expect(resolveUpdateFeed({})).toBe(DEFAULT_UPDATE_FEED_URL);
    expect(DEFAULT_UPDATE_FEED_URL).toBe('https://discordy-updates.voics.nl');
  });

  it('honours UPDATE_FEED_URL', () => {
    expect(resolveUpdateFeed({ UPDATE_FEED_URL: 'https://updates.example.test' })).toBe('https://updates.example.test');
  });
});

describe('routeFromDeepLink', () => {
  it('maps invites and channels', () => {
    expect(routeFromDeepLink('discordy://invite/AbC123')).toBe('/invite/AbC123');
    expect(routeFromDeepLink('discordy://channels/1/2')).toBe('/channels/1/2');
    expect(routeFromDeepLink('discordy://channels/@me/9')).toBe('/channels/@me/9');
    expect(routeFromDeepLink('discordy://channels/1/2/3')).toBe('/channels/1/2/3');
    expect(routeFromDeepLink('discordy://channels/1/2/x')).toBeNull();
  });

  it('maps template links', () => {
    expect(routeFromDeepLink('discordy://template/AbC123xyz')).toBe('/template/AbC123xyz');
    expect(routeFromDeepLink('discordy://template/builtin-gaming')).toBe('/template/builtin-gaming');
    expect(routeFromDeepLink('discordy://template/<script>')).toBeNull();
    expect(routeFromDeepLink('discordy://template/a/b')).toBeNull();
  });

  it('ignores unknown or malicious links', () => {
    expect(routeFromDeepLink('https://evil.test')).toBeNull();
    expect(routeFromDeepLink('discordy://settings/../../x')).toBeNull();
    expect(routeFromDeepLink('discordy://invite/<script>')).toBeNull();
  });
});

describe('DeepLinkInbox', () => {
  it('holds the launch link until the renderer asks, then delivers live', async () => {
    const { DeepLinkInbox } = await import('../../../src/main/deepLinks');
    const inbox = new DeepLinkInbox('/invite/cold');
    const sent: string[] = [];
    inbox.submit('/invite/early', (r) => sent.push(r));
    expect(sent).toEqual([]);
    expect(inbox.take()).toBe('/invite/early');
    expect(inbox.take()).toBeNull();
    inbox.submit('/invite/live', (r) => sent.push(r));
    expect(sent).toEqual(['/invite/live']);
  });
});
