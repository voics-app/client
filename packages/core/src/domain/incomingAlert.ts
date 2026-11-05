/** Whether an incoming message deserves an alert (sound, notification, in-app banner) and the text to show for it. */
import type { GuildNotificationSettings } from '../contracts/rest';
import { parseMarkdown, toPlainText } from './markdown';
import { isMentioned, isSilent, shouldAlert, type NotifyLevel, type PolicyMessage } from './notificationPolicy';
import { effectiveLevelDeep, isChannelMutedDeep, serverDefaultLevel } from './notificationSettings';

export interface IncomingAlertInput {
  message: PolicyMessage & { channel_id: string; author: { id: string } };
  meId: string;
  /** The message's channel, for the category's mute and level. */
  channel: { parent_id?: string | null } | undefined;
  /** The viewer's notification settings for the message's server (or DMs). */
  settings: GuildNotificationSettings | undefined;
  /** The server's `default_message_notifications`. */
  guildDefaultNotifications: number | undefined;
  /** The viewer's roles in the message's server. */
  myRoleIds: readonly string[];
  /** The device-local "only mentions" preference. */
  onlyMentionsPref: boolean;
  /** The viewer is looking at this message's channel right now. */
  viewingChannel: boolean;
  doNotDisturb: boolean;
  now: number;
}

/** The notification rules shared by the desktop toast and the mobile banner. Own and silent messages never alert. */
export function incomingAlert(input: IncomingAlertInput): boolean {
  const { message, settings } = input;
  if (message.author.id === input.meId || isSilent(message)) return false;
  const channel = { id: message.channel_id, parent_id: input.channel?.parent_id };
  const synced = effectiveLevelDeep(settings, channel, serverDefaultLevel(input.guildDefaultNotifications));
  const level: NotifyLevel = synced === 2 ? 'none' : synced === 1 || input.onlyMentionsPref ? 'mentions' : 'all';
  const mentioned = isMentioned(message, { meId: input.meId, myRoleIds: input.myRoleIds, suppressEveryone: settings?.suppress_everyone, suppressRoles: settings?.suppress_roles });
  return shouldAlert({ mentioned, level, muted: isChannelMutedDeep(settings, channel, input.now), viewingChannel: input.viewingChannel, doNotDisturb: input.doNotDisturb });
}

/** The message as plain text for a notification, at most `limit` characters; private messages never show their text. */
export function alertBody(message: { content: string; deliveryMode?: string }, limit = 180): string {
  if (message.deliveryMode === 'ephemeral' || message.deliveryMode === 'p2p') return 'Sent a private message';
  return toPlainText(parseMarkdown(message.content)).slice(0, limit) || 'Sent an attachment';
}
