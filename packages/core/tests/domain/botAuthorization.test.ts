import { describe, expect, it } from 'vitest';
import { authorizationRoute, parseAuthorizationRoute, permissionChecklist } from '../../src/domain/botAuthorization';
import { Permission } from '../../src/contracts/permissions';

describe('bot install links', () => {
  it('normalizes supported scopes, preserves a server choice and parses the canonical route', () => {
    const route = authorizationRoute(new URLSearchParams('client_id=123&scope=applications.commands+bot+bot&permissions=3072&guild_id=456'));
    expect(route).toBe('/oauth2/authorize?client_id=123&scope=bot+applications.commands&permissions=3072&guild_id=456');
    expect(parseAuthorizationRoute(route!)).toEqual({ client_id: '123', scope: 'bot applications.commands', permissions: '3072', guild_id: '456' });
    expect(authorizationRoute(new URLSearchParams('client_id=123'))).toBe('/oauth2/authorize?client_id=123&scope=bot&permissions=0');
  });

  it.each([
    'client_id=123&scope=identify', 'client_id=123&scope=applications.commands',
    'client_id=123&scope=bot+guilds', 'client_id=0', 'client_id=-123',
    'client_id=9223372036854775808', 'client_id=123&guild_id=abc',
    'client_id=123&permissions=8.5', 'client_id=123&permissions=-1',
    'client_id=123&permissions=9223372036854775808',
    'client_id=123&redirect_uri=https://example.invalid', 'client_id=123&response_type=code',
    'client_id=123&client_id=456', 'client_id=123&scope=bot&scope=identify',
  ])('rejects unsupported or ambiguous input: %s', (query) => {
    expect(authorizationRoute(new URLSearchParams(query))).toBeNull();
  });

  it('accepts only the precise in-app authorization path', () => {
    expect(parseAuthorizationRoute('/oauth2/authorize/extra?client_id=123')).toBeNull();
    expect(parseAuthorizationRoute('https://example.invalid/oauth2/authorize?client_id=123')).toBeNull();
    expect(parseAuthorizationRoute('/oauth2/authorize?client_id=123#fragment')).toBeNull();
  });
});

describe('permission checklist', () => {
  it('names every requested permission and makes administrator implications explicit', () => {
    expect(permissionChecklist(String(Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES))).toEqual([
      { id: 'VIEW_CHANNEL', label: 'View channels' }, { id: 'SEND_MESSAGES', label: 'Send messages' },
    ]);
    expect(permissionChecklist('8')[0]?.label).toBe('Administrator — all permissions, bypassing channel restrictions');
    expect(permissionChecklist('0')).toEqual([]);
  });
});
