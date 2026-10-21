/** UI-facing wrappers over the synced notification commands: real API, error toasts. */
import * as commands from '@renderer/application/notificationActions';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import type { NotificationLevel } from '@shared/contracts/rest';
import { attempt } from './actions';
import { getRuntime } from './runtime';

const api = () => getRuntime().api;

export const scopeOf = (channelId: string): string | null => useGuildStore.getState().channels[channelId]?.guild_id ?? null;

export function muteGuild(guildId: string, seconds: number | null | undefined): Promise<unknown> {
  return attempt(() => commands.muteScope(api(), guildId, null, seconds), 'Could not update mute');
}

export function muteChannel(guildId: string | null, channelId: string, seconds: number | null | undefined): Promise<unknown> {
  return attempt(() => commands.muteScope(api(), guildId, channelId, seconds), 'Could not update mute');
}

export function setGuildLevel(guildId: string | null, level: NotificationLevel | null): Promise<unknown> {
  return attempt(() => commands.setLevel(api(), guildId, null, level), 'Could not save notification settings');
}

export function setChannelLevel(guildId: string | null, channelId: string, level: NotificationLevel | null): Promise<unknown> {
  return attempt(() => commands.setLevel(api(), guildId, channelId, level), 'Could not save notification settings');
}

export function setGuildToggles(guildId: string | null, toggles: Partial<commands.GuildToggles>): Promise<unknown> {
  return attempt(() => commands.setToggles(api(), guildId, toggles), 'Could not save notification settings');
}
