/** Mute and notification-level commands against the synced settings (optimistic, rolled back on failure). */
import type { ApiPort } from '@discordy/core/application/ports/api';
import { saveGuildNotificationSettings } from './notificationSync';
import {
  muteConfigFor,
  withLevel,
  withMute,
} from '@discordy/core/domain/notificationSettings';
import type { GuildNotificationSettings, GuildNotificationSettingsPatch, NotificationLevel } from '@discordy/core/contracts/rest';

type Api = Pick<ApiPort, 'updateGuildNotificationSettings' | 'putUserNote'>;

/** Mutes (`seconds` a number or null = until turned off) or unmutes (undefined) the guild, or one channel when `channelId` is set. `guildId` null is DMs. */
export function muteScope(api: Api, guildId: string | null, channelId: string | null, seconds: number | null | undefined, now = Date.now()): Promise<GuildNotificationSettings> {
  const muted = seconds !== undefined;
  const mute = { muted, mute_config: muted ? muteConfigFor(seconds) : null };
  const patch: GuildNotificationSettingsPatch = channelId === null ? mute : { channel_overrides: [{ channel_id: channelId, ...mute }] };
  return saveGuildNotificationSettings(api, guildId, patch, (cur) => withMute(cur, channelId, seconds, now));
}

/** Sets the level for the guild or one channel (`null` inherits). */
export function setLevel(api: Api, guildId: string | null, channelId: string | null, level: NotificationLevel | null): Promise<GuildNotificationSettings> {
  const patch: GuildNotificationSettingsPatch =
    channelId === null ? { message_notifications: level } : { channel_overrides: [{ channel_id: channelId, message_notifications: level }] };
  return saveGuildNotificationSettings(api, guildId, patch, (cur) => withLevel(cur, channelId, level));
}

export type GuildToggles = Pick<GuildNotificationSettings, 'suppress_everyone' | 'suppress_roles' | 'hide_muted_channels'>;

/** Suppress @everyone/@here, suppress role mentions, hide muted channels. */
export function setToggles(api: Api, guildId: string | null, toggles: Partial<GuildToggles>): Promise<GuildNotificationSettings> {
  return saveGuildNotificationSettings(api, guildId, toggles, (cur) => ({ ...cur, ...toggles }));
}
