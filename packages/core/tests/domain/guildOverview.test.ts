import { describe, expect, it } from 'vitest';
import type { Guild } from '@discordy/core/contracts/rest';
import { SystemFlag, draftFromGuild, flagEnabled, overviewPatch, withFlag } from '@discordy/core/domain/guildOverview';

const guild: Guild = { id: 'g', name: 'HQ', icon: null, owner_id: 'o', roles: [], emojis: [], system_channel_id: 'c1', system_channel_flags: 0, afk_timeout: 300, default_message_notifications: 1 };

describe('guild overview draft', () => {
  it('reads the toggles as the inverse of Discord suppress bits', () => {
    expect(flagEnabled(0, SystemFlag.SUPPRESS_JOIN_NOTIFICATIONS)).toBe(true);
    expect(flagEnabled(1, SystemFlag.SUPPRESS_JOIN_NOTIFICATIONS)).toBe(false);
    expect(withFlag(0, SystemFlag.SUPPRESS_JOIN_NOTIFICATIONS, false)).toBe(1);
    expect(withFlag(5, SystemFlag.SUPPRESS_JOIN_NOTIFICATIONS, true)).toBe(4);
  });

  it('sends prune_admin_only only when the toggle changed', () => {
    expect(draftFromGuild(guild).pruneAdminOnly).toBe(false);
    expect(overviewPatch(guild, { ...draftFromGuild(guild), pruneAdminOnly: true })).toEqual({ prune_admin_only: true });
    const restricted = { ...guild, prune_admin_only: true };
    expect(draftFromGuild(restricted).pruneAdminOnly).toBe(true);
    expect(overviewPatch(restricted, draftFromGuild(restricted))).toEqual({});
  });

  it('sends nothing when the draft equals the guild', () => {
    expect(overviewPatch(guild, draftFromGuild(guild))).toEqual({});
  });

  it('sends only the changed fields and maps empty selections to null', () => {
    const draft = { ...draftFromGuild(guild), systemChannelId: '', systemFlags: 1, afkChannelId: 'v1', afkTimeout: 900, notifications: 0, banner: 'data:image/png;base64,AA', splash: null };
    expect(overviewPatch(guild, draft)).toEqual({
      system_channel_id: null,
      system_channel_flags: 1,
      afk_channel_id: 'v1',
      afk_timeout: 900,
      default_message_notifications: 0,
      banner: 'data:image/png;base64,AA',
      splash: null,
    });
  });
});
