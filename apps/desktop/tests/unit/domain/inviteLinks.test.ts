import { describe, expect, it } from 'vitest';
import { inviteWebUrl, landingOrigin, parseInviteCode } from '../../../src/renderer/domain/inviteLinks';

describe('parseInviteCode', () => {
  it('accepts codes, web links and deep links', () => {
    expect(parseInviteCode('hTKzmak')).toBe('hTKzmak');
    expect(parseInviteCode(' https://discordy.voics.nl/invite/hTKzmak ')).toBe('hTKzmak');
    expect(parseInviteCode('http://127.0.0.1:18000/invite/abc-12/')).toBe('abc-12');
    expect(parseInviteCode('discordy://invite/hTKzmak')).toBe('hTKzmak');
    expect(parseInviteCode('https://discordy.voics.nl/invite/hTKzmak?x=1')).toBe('hTKzmak');
  });
});

describe('inviteWebUrl', () => {
  it('uses the landing host in production', () => {
    expect(landingOrigin('https://discordy-api.voics.nl')).toBe('https://discordy.voics.nl');
    expect(inviteWebUrl('abc', 'https://discordy-api.voics.nl')).toBe('https://discordy.voics.nl/invite/abc');
  });
  it('uses the local ingress for the local stack', () => {
    expect(inviteWebUrl('abc', 'http://127.0.0.1:18000')).toBe('http://127.0.0.1:18000/invite/abc');
  });
  it('falls back to production for an unparsable api url', () => {
    expect(landingOrigin('')).toBe('https://discordy.voics.nl');
  });
});
