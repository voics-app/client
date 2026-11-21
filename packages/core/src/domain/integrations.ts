import { createI18n } from './i18n';
import { Permission } from '../contracts/permissions';
import type { Channel, Webhook, WebhookEdit } from '../contracts/rest';
import { computeChannelPermissions, hasPermission, type PermissionContext } from './permissions';

export interface WebhookDraft { name: string; channelId: string; avatar?: string | null }

export function webhookNameError(name: string, locale?: string): string | null {
  const length = Array.from(name.trim()).length;
  return length < 1 || length > 80 ? createI18n(locale).catalogText('Use a name between 1 and 80 characters.') : null;
}

/** Metadata writes cannot include an execution token. Undefined image means unchanged. */
export function webhookPatch(original: Webhook, draft: WebhookDraft): WebhookEdit {
  const patch: WebhookEdit = {};
  if (draft.name.trim() !== original.name) patch.name = draft.name.trim();
  if (draft.channelId !== original.channel_id) patch.channel_id = draft.channelId;
  if (draft.avatar !== undefined && draft.avatar !== original.avatar) patch.avatar = draft.avatar;
  return patch;
}

export function webhookChannels(channels: readonly Channel[], context: PermissionContext): Channel[] {
  return channels.filter((channel) => channel.guild_id === context.guildId && [0, 2, 5, 13, 15].includes(channel.type)
    && hasPermission(computeChannelPermissions(context, channel.permission_overwrites ?? []), Permission.VIEW_CHANNEL | Permission.MANAGE_WEBHOOKS))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
}
