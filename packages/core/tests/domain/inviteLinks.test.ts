import { describe, expect, it } from 'vitest';
import { inviteWebUrl, landingOrigin, parseInviteCode } from '../../src/domain/inviteLinks';

describe('parseInviteCode', () => {
  it('accepts codes, web links and deep links', () => {
    expect(parseInviteCode('hTKzmak')).toBe('hTKzmak');
    expect(parseInviteCode(' https://testcord.example/invite/hTKzmak ')).toBe('hTKzmak');
    expect(parseInviteCode('http://127.0.0.1:18000/invite/abc-12/')).toBe('abc-12');
    expect(parseInviteCode('testcord://invite/hTKzmak')).toBe('hTKzmak');
    expect(parseInviteCode('https://testcord.example/invite/hTKzmak?x=1')).toBe('hTKzmak');
  });
});

describe('inviteWebUrl', () => {
  it('uses the landing host in production', () => {
    expect(landingOrigin('https://api.testcord.example')).toBe('https://testcord.example');
    expect(inviteWebUrl('abc', 'https://api.testcord.example')).toBe('https://testcord.example/invite/abc');
  });
  it('uses the local ingress for the local stack', () => {
    expect(inviteWebUrl('abc', 'http://127.0.0.1:18000')).toBe('http://127.0.0.1:18000/invite/abc');
  });
  it('falls back to production for an unparsable api url', () => {
    expect(landingOrigin('')).toBe('https://testcord.example');
  });
});
