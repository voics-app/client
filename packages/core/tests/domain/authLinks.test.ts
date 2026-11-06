import { beforeEach, describe, expect, it } from 'vitest';
import { parseAuthRoute, parseAuthToken } from '../../src/domain/authLinks';
import { useAuthLinkStore } from '../../src/application/stores/authLinkStore';

const TOKEN = 'k3J9x_Qw-1Zp0aB7cD4eF6gH8iJ2lMnO';

describe('auth links', () => {
  it('accepts the base64url tokens the api sends', () => {
    expect(parseAuthToken(TOKEN)).toBe(TOKEN);
  });

  it('rejects short, long, padded or otherwise odd tokens', () => {
    for (const bad of ['', 'short', `${TOKEN}=`, `${TOKEN}/x`, 'a'.repeat(129), '<script>alert(1)</script>', 'tok en tok en tok en!!', 42, null, undefined]) {
      expect(parseAuthToken(bad)).toBeNull();
    }
  });

  it('reads the two routes and nothing else', () => {
    expect(parseAuthRoute(`/reset-password/${TOKEN}`)).toEqual({ kind: 'reset-password', token: TOKEN });
    expect(parseAuthRoute(`/verify-email/${TOKEN}`)).toEqual({ kind: 'verify-email', token: TOKEN });
    expect(parseAuthRoute('/reset-password/short')).toBeNull();
    expect(parseAuthRoute(`/reset-password/${TOKEN}/extra`)).toBeNull();
    expect(parseAuthRoute(`/invite/${TOKEN}`)).toBeNull();
  });
});

describe('auth link store', () => {
  beforeEach(() => useAuthLinkStore.setState({ link: null }));

  it('hands a waiting link over once', () => {
    useAuthLinkStore.getState().set({ kind: 'reset-password', token: TOKEN });
    expect(useAuthLinkStore.getState().take()).toEqual({ kind: 'reset-password', token: TOKEN });
    expect(useAuthLinkStore.getState().take()).toBeNull();
  });
});
