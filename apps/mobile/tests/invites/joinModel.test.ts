import '../../src/brand';
import type { Invite } from '@discordy/core/contracts/rest';
import { inviteCodeOf, invitePreview } from '../../src/invites/joinModel';

describe('inviteCodeOf', () => {
  it.each([
    ['hTKzmak', 'hTKzmak'],
    ['  hTKzmak  ', 'hTKzmak'],
    ['https://voics.app/invite/hTKzmak', 'hTKzmak'],
    ['https://voics.app/invite/hTKzmak/', 'hTKzmak'],
    ['https://voics.app/invite/hTKzmak?ref=x', 'hTKzmak'],
    ['voics://invite/hTKzmak', 'hTKzmak'],
    ['invite/abc-def', 'abc-def'],
  ])('reads %s as %s', (input, code) => expect(inviteCodeOf(input)).toBe(code));

  it.each(['', '   ', 'a', 'two words', 'bad!code'])('refuses %j', (input) => expect(inviteCodeOf(input)).toBeNull());
});

describe('invitePreview', () => {
  it('names the server and counts its people', () => {
    expect(invitePreview({ code: 'x', guild: { id: 'g1', name: 'Chess' }, approximate_member_count: 12, approximate_presence_count: 3 } as Invite)).toEqual({ name: 'Chess', people: '12 members, 3 online', guildId: 'g1' });
  });

  it('shows ? for counts the server did not send and a fallback name', () => {
    expect(invitePreview({ code: 'x' } as Invite)).toEqual({ name: 'this server', people: '? members, ? online', guildId: null });
  });
});
