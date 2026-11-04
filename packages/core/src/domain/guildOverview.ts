import type { Guild } from '../contracts/rest';

/** `system_channel_flags` bits. Discord names them as suppressions, so a toggle shows the inverse. */
export const SystemFlag = {
  SUPPRESS_JOIN_NOTIFICATIONS: 1 << 0,
  SUPPRESS_GUILD_REMINDER_NOTIFICATIONS: 1 << 2,
  SUPPRESS_JOIN_NOTIFICATION_REPLIES: 1 << 3,
} as const;

export const AFK_TIMEOUTS = [
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 900, label: '15 minutes' },
  { seconds: 1800, label: '30 minutes' },
  { seconds: 3600, label: '1 hour' },
] as const;

export const DEFAULT_AFK_TIMEOUT = 300;

/** Default notification levels the api accepts: 0 all messages, 1 only mentions. */
export const NOTIFICATION_LEVELS = [
  { value: 0, label: 'All messages' },
  { value: 1, label: 'Only @mentions' },
] as const;

/** The editable overview fields of a guild, as the form holds them. Images: undefined keeps, null clears, a data URI replaces. */
export interface OverviewDraft {
  name: string;
  description: string;
  region: string;
  systemChannelId: string;
  systemFlags: number;
  afkChannelId: string;
  afkTimeout: number;
  notifications: number;
  pruneAdminOnly: boolean;
  icon: string | null | undefined;
  banner: string | null | undefined;
  splash: string | null | undefined;
}

export function draftFromGuild(guild: Guild): OverviewDraft {
  return {
    name: guild.name,
    description: guild.description ?? '',
    region: guild.voice_region ?? '',
    systemChannelId: guild.system_channel_id ?? '',
    systemFlags: guild.system_channel_flags ?? 0,
    afkChannelId: guild.afk_channel_id ?? '',
    afkTimeout: guild.afk_timeout ?? DEFAULT_AFK_TIMEOUT,
    notifications: guild.default_message_notifications ?? 0,
    pruneAdminOnly: guild.prune_admin_only ?? false,
    icon: undefined,
    banner: undefined,
    splash: undefined,
  };
}

/** Whether the toggle for a suppression bit is on, that is the bit is clear. */
export function flagEnabled(flags: number, bit: number): boolean {
  return (flags & bit) === 0;
}

export function withFlag(flags: number, bit: number, enabled: boolean): number {
  return enabled ? flags & ~bit : flags | bit;
}

/** The PATCH body with only the fields that differ from the guild; empty when nothing changed. */
export function overviewPatch(guild: Guild, draft: OverviewDraft): Partial<Guild> & { splash?: string | null } {
  const saved = draftFromGuild(guild);
  const patch: Record<string, unknown> = {};
  if (draft.name !== saved.name) patch.name = draft.name;
  if (draft.description !== saved.description) patch.description = draft.description || null;
  if (draft.region !== saved.region) patch.voice_region = draft.region || null;
  if (draft.systemChannelId !== saved.systemChannelId) patch.system_channel_id = draft.systemChannelId || null;
  if (draft.systemFlags !== saved.systemFlags) patch.system_channel_flags = draft.systemFlags;
  if (draft.afkChannelId !== saved.afkChannelId) patch.afk_channel_id = draft.afkChannelId || null;
  if (draft.afkTimeout !== saved.afkTimeout) patch.afk_timeout = draft.afkTimeout;
  if (draft.notifications !== saved.notifications) patch.default_message_notifications = draft.notifications;
  if (draft.pruneAdminOnly !== saved.pruneAdminOnly) patch.prune_admin_only = draft.pruneAdminOnly;
  if (draft.icon !== undefined) patch.icon = draft.icon;
  if (draft.banner !== undefined) patch.banner = draft.banner;
  if (draft.splash !== undefined) patch.splash = draft.splash;
  return patch;
}
