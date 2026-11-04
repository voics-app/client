import { TEST_BRAND } from '../support/brandFixture';
import { describe, expect, it } from 'vitest';
import { orderSessions, regionName, sessionDetail, sessionTitle } from '../../src/domain/authSessions';
import type { AuthSession } from '../../src/contracts/rest';

const NOW = Date.parse('2026-11-04T12:00:00Z');

const session = (patch: Partial<AuthSession>): AuthSession => ({
  id: 's',
  client: 'Desktop app',
  os: 'Windows',
  device_name: null,
  location: null,
  created_at: '2026-11-01T00:00:00Z',
  last_used_at: '2026-11-04T11:58:00Z',
  current: false,
  ...patch,
});

describe('auth sessions model', () => {
  it('puts the current session first, then the most recently used', () => {
    const ordered = orderSessions([
      session({ id: 'old', last_used_at: '2026-10-01T00:00:00Z' }),
      session({ id: 'here', current: true, last_used_at: '2026-09-01T00:00:00Z' }),
      session({ id: 'recent', last_used_at: '2026-11-03T00:00:00Z' }),
    ]);
    expect(ordered.map((s) => s.id)).toEqual(['here', 'recent', 'old']);
  });

  it('does not mutate its input', () => {
    const input = [session({ id: 'a' }), session({ id: 'b', current: true })];
    orderSessions(input);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('titles a session by client and OS, dropping an unknown OS', () => {
    expect(sessionTitle(session({}))).toBe(`${TEST_BRAND.displayName} on Windows`);
    expect(sessionTitle(session({ client: 'Firefox', os: 'Unknown' }))).toBe('Firefox');
  });

  it('details location, device and last activity, leaving out what is unknown', () => {
    expect(sessionDetail(session({}), NOW)).toBe('Active 2 minutes ago');
    expect(sessionDetail(session({ location: 'NL', device_name: 'Laptop' }), NOW)).toBe('Netherlands · Laptop · Active 2 minutes ago');
    expect(sessionDetail(session({ current: true }), NOW)).toBe('Active now');
  });

  it('falls back to the code for an unnamed region', () => {
    expect(regionName('NL')).toBe('Netherlands');
    expect(regionName('not a code')).toBe('not a code');
  });
});
