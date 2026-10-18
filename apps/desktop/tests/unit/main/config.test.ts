import { describe, expect, it } from 'vitest';
import { DEFAULT_UPDATE_FEED_URL, PROFILES, resolveConnection, resolveUpdateFeed } from '../../../src/main/config';
import { routeFromDeepLink } from '../../../src/main/deepLinks';

describe('resolveConnection', () => {
  it('defaults to production endpoints', () => {
    expect(resolveConnection({}, null)).toEqual(PROFILES.production);
    expect(PROFILES.production.apiUrl).toBe('https://discordy-api.voics.nl');
    expect(PROFILES.production.gatewayUrl).toBe('wss://discordy-gateway.voics.nl');
  });

  it('local profile points at the compose ingress on :8000', () => {
    const local = resolveConnection({ DISCORDY_PROFILE: 'local' }, null);
    expect(local.apiUrl).toBe('http://localhost:8000');
    expect(local.gatewayUrl).toBe('ws://localhost:8000');
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
    expect(routeFromDeepLink('voics://invite/AbC123')).toBe('/invite/AbC123');
    expect(routeFromDeepLink('voics://channels/1/2')).toBe('/channels/1/2');
    expect(routeFromDeepLink('voics://channels/@me/9')).toBe('/channels/@me/9');
  });

  it('ignores unknown or malicious links', () => {
    expect(routeFromDeepLink('https://evil.test')).toBeNull();
    expect(routeFromDeepLink('voics://settings/../../x')).toBeNull();
    expect(routeFromDeepLink('voics://invite/<script>')).toBeNull();
  });
});
