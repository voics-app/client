import { describe, expect, it } from 'vitest';
import { BRAND } from '@shared/brand';
import { instanceInviteCodes } from '@renderer/domain/inviteLinks';

describe('instanceInviteCodes', () => {
  it('finds invite links on the brand landing host', () => {
    expect(instanceInviteCodes(`join ${BRAND.landingUrl}/invite/abc123 now`, BRAND.apiUrl)).toEqual(['abc123']);
  });
  it('ignores foreign hosts and dedupes', () => {
    const text = `https://evil.example/invite/zzz ${BRAND.landingUrl}/invite/abc ${BRAND.landingUrl}/invite/abc`;
    expect(instanceInviteCodes(text, BRAND.apiUrl)).toEqual(['abc']);
  });
  it('uses the local stack origin for a non-brand connection', () => {
    expect(instanceInviteCodes('http://localhost:8080/invite/dev1', 'http://localhost:8080')).toEqual(['dev1']);
  });
});
