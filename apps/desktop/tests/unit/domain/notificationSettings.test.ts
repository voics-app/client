import { describe, expect, it } from 'vitest';
import { effectiveLevel, emptySettings, isChannelMuted, shouldNotify, withMute } from '@renderer/domain/notificationSettings';
import type { GuildNotificationSettings } from '@shared/contracts/rest';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const plain = { mentioned: false, mentionsEveryone: false, mentionsRole: false };

const base = (over: Partial<GuildNotificationSettings> = {}): GuildNotificationSettings => ({ ...emptySettings('g'), ...over });

describe('notification settings rules', () => {
  it('channel override beats the guild level, which beats the server default', () => {
    const s = base({
      message_notifications: 1,
      channel_overrides: [{ channel_id: 'c1', message_notifications: 2, muted: false, mute_config: null }],
    });
    expect(effectiveLevel(s, 'c1', 0)).toBe(2);
    expect(effectiveLevel(s, 'c2', 0)).toBe(1);
    expect(effectiveLevel(base(), 'c2', 1)).toBe(1);
    expect(effectiveLevel(undefined, 'c2', 0)).toBe(0);
  });

  it('a null mute end time is indefinite and an expired one is ignored', () => {
    const forever = base({ muted: true, mute_config: { end_time: null } });
    expect(isChannelMuted(forever, 'c', NOW + 1e12)).toBe(true);
    const timed = base({ muted: true, mute_config: { end_time: new Date(NOW + 60_000).toISOString() } });
    expect(isChannelMuted(timed, 'c', NOW)).toBe(true);
    expect(isChannelMuted(timed, 'c', NOW + 61_000)).toBe(false);
  });

  it('a muted guild mutes its channels; a channel mute is local', () => {
    const s = base({ channel_overrides: [{ channel_id: 'c1', message_notifications: null, muted: true, mute_config: null }] });
    expect(isChannelMuted(s, 'c1', NOW)).toBe(true);
    expect(isChannelMuted(s, 'c2', NOW)).toBe(false);
    expect(isChannelMuted(base({ muted: true, mute_config: null }), 'c2', NOW)).toBe(true);
  });

  it('decides notifications by level, mentions and suppression flags', () => {
    const mentions = base({ message_notifications: 1 });
    expect(shouldNotify(mentions, 'c', 0, plain, NOW)).toBe(false);
    expect(shouldNotify(mentions, 'c', 0, { ...plain, mentioned: true }, NOW)).toBe(true);
    expect(shouldNotify(mentions, 'c', 0, { ...plain, mentionsEveryone: true }, NOW)).toBe(true);
    expect(shouldNotify({ ...mentions, suppress_everyone: true }, 'c', 0, { ...plain, mentionsEveryone: true }, NOW)).toBe(false);
    expect(shouldNotify({ ...mentions, suppress_roles: true }, 'c', 0, { ...plain, mentionsRole: true }, NOW)).toBe(false);
    expect(shouldNotify(base({ message_notifications: 2 }), 'c', 0, { ...plain, mentioned: true }, NOW)).toBe(false);
    expect(shouldNotify(base({ message_notifications: 0, muted: true, mute_config: null }), 'c', 0, plain, NOW)).toBe(false);
    expect(shouldNotify(undefined, 'c', 0, plain, NOW)).toBe(true);
  });

  it('withMute computes end times and clears overrides that become empty', () => {
    const hour = withMute(base(), 'c1', 3600, NOW);
    expect(hour.channel_overrides[0]).toMatchObject({ channel_id: 'c1', muted: true, mute_config: { end_time: new Date(NOW + 3_600_000).toISOString() } });
    expect(withMute(hour, 'c1', undefined, NOW).channel_overrides).toEqual([]);
    expect(withMute(base(), null, null, NOW)).toMatchObject({ muted: true, mute_config: { end_time: null } });
  });
});
