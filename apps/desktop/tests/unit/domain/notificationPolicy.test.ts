import { describe, expect, it } from 'vitest';
import { isMentioned, shouldNotify, type NotifyInput, type PolicyMessage } from '@renderer/domain/notificationPolicy';

const msg = (extra: Partial<PolicyMessage> = {}): PolicyMessage => ({ guild_id: 'g', mentions: [], mention_roles: [], mention_everyone: false, ...extra });
const ctx = { meId: 'me', myRoleIds: ['r1'] };

describe('isMentioned', () => {
  it('treats DMs as mentions', () => expect(isMentioned(msg({ guild_id: null }), ctx)).toBe(true));
  it('matches a direct mention', () => expect(isMentioned(msg({ mentions: [{ id: 'me' }] }), ctx)).toBe(true));
  it('matches a role the viewer holds, not others', () => {
    expect(isMentioned(msg({ mention_roles: ['r1'] }), ctx)).toBe(true);
    expect(isMentioned(msg({ mention_roles: ['r2'] }), ctx)).toBe(false);
  });
  it('honours @everyone suppression', () => {
    expect(isMentioned(msg({ mention_everyone: true }), ctx)).toBe(true);
    expect(isMentioned(msg({ mention_everyone: true }), { ...ctx, suppressEveryone: true })).toBe(false);
  });
  it('is false for a plain guild message', () => expect(isMentioned(msg(), ctx)).toBe(false));
});

describe('shouldNotify', () => {
  const base: NotifyInput = { mentioned: false, level: 'all', muted: false, viewingChannel: false, desktopEnabled: true, doNotDisturb: false };
  it('notifies for any message at level all', () => expect(shouldNotify(base)).toBe(true));
  it('only mentions at level mentions', () => {
    expect(shouldNotify({ ...base, level: 'mentions' })).toBe(false);
    expect(shouldNotify({ ...base, level: 'mentions', mentioned: true })).toBe(true);
  });
  it('never at level none', () => expect(shouldNotify({ ...base, level: 'none', mentioned: true })).toBe(false));
  it.each([{ muted: true }, { viewingChannel: true }, { desktopEnabled: false }, { doNotDisturb: true }])('suppressed by %o', (o) =>
    expect(shouldNotify({ ...base, mentioned: true, ...o })).toBe(false),
  );
});
