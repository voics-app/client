/** Notification rules (Discord semantics): channel override beats guild level beats the server default. */
import type {
  ChannelNotificationOverride,
  GuildNotificationSettings,
  MuteConfig,
  NotificationLevel,
} from '@shared/contracts/rest';

export const DM_SCOPE = '@me';

/** Mute durations of the "Mute" submenu, in seconds; `null` is "until I turn it back on". */
export const MUTE_DURATIONS = [
  { id: '15m', label: 'For 15 minutes', seconds: 15 * 60 },
  { id: '1h', label: 'For 1 hour', seconds: 60 * 60 },
  { id: '3h', label: 'For 3 hours', seconds: 3 * 60 * 60 },
  { id: '8h', label: 'For 8 hours', seconds: 8 * 60 * 60 },
  { id: '24h', label: 'For 24 hours', seconds: 24 * 60 * 60 },
  { id: 'forever', label: 'Until I turn it back on', seconds: null },
] as const;

export function emptySettings(guildId: string | null): GuildNotificationSettings {
  return {
    guild_id: guildId,
    message_notifications: null,
    suppress_everyone: false,
    suppress_roles: false,
    muted: false,
    mute_config: null,
    hide_muted_channels: false,
    channel_overrides: [],
  };
}

export function scopeKey(guildId: string | null | undefined): string {
  return guildId ?? DM_SCOPE;
}

/** A mute applies while muted and its end time (if any) has not passed. */
export function isMuteActive(muted: boolean, config: MuteConfig | null, now: number): boolean {
  if (!muted) return false;
  if (!config || config.end_time === null) return true;
  const end = Date.parse(config.end_time);
  return Number.isNaN(end) || end > now;
}

export function channelOverride(settings: GuildNotificationSettings | undefined, channelId: string): ChannelNotificationOverride | undefined {
  return settings?.channel_overrides.find((o) => o.channel_id === channelId);
}

/** Whether the guild itself is muted right now. */
export function isGuildMuted(settings: GuildNotificationSettings | undefined, now: number): boolean {
  return !!settings && isMuteActive(settings.muted, settings.mute_config, now);
}

/** A channel is muted by its own mute or by its guild's. */
export function isChannelMuted(settings: GuildNotificationSettings | undefined, channelId: string, now: number): boolean {
  if (isGuildMuted(settings, now)) return true;
  const o = channelOverride(settings, channelId);
  return !!o && isMuteActive(o.muted, o.mute_config, now);
}

/** Channel override, else guild level, else the guild's `default_message_notifications`. */
export function effectiveLevel(
  settings: GuildNotificationSettings | undefined,
  channelId: string,
  guildDefault: NotificationLevel,
): NotificationLevel {
  return channelOverride(settings, channelId)?.message_notifications ?? settings?.message_notifications ?? guildDefault;
}

/** Whether a message should notify (badge/sound/desktop) the user. */
export function shouldNotify(
  settings: GuildNotificationSettings | undefined,
  channelId: string,
  guildDefault: NotificationLevel,
  message: { mentioned: boolean; mentionsEveryone: boolean; mentionsRole: boolean },
  now: number,
): boolean {
  if (isChannelMuted(settings, channelId, now)) return false;
  const level = effectiveLevel(settings, channelId, guildDefault);
  if (level === 2) return false;
  if (level === 0) return true;
  if (message.mentioned) return true;
  if (message.mentionsEveryone && !settings?.suppress_everyone) return true;
  return message.mentionsRole && !settings?.suppress_roles;
}

/** The `mute_config` a client sends for a duration of {@link MUTE_DURATIONS}. */
export function muteConfigFor(seconds: number | null): { selected_time_window: number } {
  return { selected_time_window: seconds ?? -1 };
}

/** Optimistic local result of muting (`seconds` undefined = unmute) a guild or one channel. */
export function withMute(
  settings: GuildNotificationSettings,
  channelId: string | null,
  seconds: number | null | undefined,
  now: number,
): GuildNotificationSettings {
  const muted = seconds !== undefined;
  const config: MuteConfig | null = muted ? { end_time: seconds === null ? null : new Date(now + seconds * 1000).toISOString() } : null;
  if (channelId === null) return { ...settings, muted, mute_config: config };
  const existing = channelOverride(settings, channelId);
  const next: ChannelNotificationOverride = {
    channel_id: channelId,
    message_notifications: existing?.message_notifications ?? null,
    muted,
    mute_config: config,
  };
  const rest = settings.channel_overrides.filter((o) => o.channel_id !== channelId);
  return { ...settings, channel_overrides: next.message_notifications === null && !muted ? rest : [...rest, next] };
}
