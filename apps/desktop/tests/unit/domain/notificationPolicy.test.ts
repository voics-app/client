import { describe, expect, it } from 'vitest';
import { shouldAlert, isMentioned, shouldNotify, type NotifyInput, type PolicyMessage } from '@renderer/domain/notificationPolicy';

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
  it('never counts a silent message, even a DM or a direct mention', () => {
    const flags = 1 << 12;
    expect(isMentioned(msg({ guild_id: null, flags }), ctx)).toBe(false);
    expect(isMentioned(msg({ mentions: [{ id: 'me' }], flags }), ctx)).toBe(false);
    expect(isMentioned(msg({ mention_everyone: true, flags }), ctx)).toBe(false);
  });
  it('a reply with the ping off does not mention the replied author', () => expect(isMentioned(msg({ mentions: [] }), ctx)).toBe(false));
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

describe('shouldAlert (sound gating, independent of the desktop toggle)', () => {
  const base = { mentioned: false, level: 'all' as const, muted: false, viewingChannel: false, doNotDisturb: false };
  it('alerts for a DM or mention while another channel is open', () => expect(shouldAlert({ ...base, level: 'mentions', mentioned: true })).toBe(true));
  it('does not alert for an unmentioned message at level mentions', () => expect(shouldAlert({ ...base, level: 'mentions' })).toBe(false));
  it.each([{ muted: true }, { viewingChannel: true }, { doNotDisturb: true }])('is silenced by %o', (o) => expect(shouldAlert({ ...base, mentioned: true, ...o })).toBe(false));
});
