/** Pure rules of push notifications on the phone: no native module, no network, no storage. */
import type { GatewayState } from '@discordy/core/application/ports/gateway';
import type { PushTokenBody } from '@discordy/core/contracts/rest';

export type PushEnvironment = PushTokenBody['environment'];
export type PermissionState = 'granted' | 'denied' | 'undetermined';

/** What the push payload names: the chat to open and, when known, the message to scroll to. */
export interface PushTarget {
  guildId: string | null;
  channelId: string;
  messageId: string | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function eventReminderKey(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const fields = data as Record<string, unknown>;
  return fields.type === 'scheduled_event' ? text(fields.dedupe_key) : null;
}

/** The chat a tapped notification opens, from the custom keys the notifier puts in the payload; null when it names no chat. */
export function pushTargetOf(data: unknown): PushTarget | null {
  if (typeof data !== 'object' || data === null) return null;
  const fields = data as Record<string, unknown>;
  const channelId = text(fields.channel_id);
  if (!channelId) return null;
  return { guildId: text(fields.guild_id), channelId, messageId: text(fields.message_id) };
}

/**
 * A push that arrives while the app is open. The in-app banner already covers a message when the gateway is live, so the system banner would
 * show it twice; it only appears when the gateway is not live (the push is then the only notice) and never for the chat on screen.
 */
export function foregroundPresentation(input: { gateway: GatewayState; viewing: string | null; data: unknown }): 'show' | 'suppress' {
  // The mobile gateway has no event banner; its event-specific push is the foreground notice.
  if (eventReminderKey(input.data)) return 'show';
  const target = pushTargetOf(input.data);
  if (target && target.channelId === input.viewing) return 'suppress';
  return input.gateway === 'ready' ? 'suppress' : 'show';
}

export type PermissionPlan = 'register' | 'offer' | 'blocked' | 'wait';

/**
 * What to do about the permission at this moment. A prompt that was never answered is offered once, and only when the person is in a chat (they
 * are using the app, so a notification has an obvious use); after a refusal the app does not ask again, Settings shows how to change it.
 */
export function permissionPlan(input: { permission: PermissionState; offered: boolean; inChat: boolean }): PermissionPlan {
  if (input.permission === 'granted') return 'register';
  if (input.permission === 'denied') return 'blocked';
  return input.offered || !input.inChat ? 'wait' : 'offer';
}

/** The body of `POST /users/@me/devices/push`: an APNs token for an iPhone, an FCM registration token for Android (which has no sandbox, so it is always `production`). */
export function registrationOf(token: string, environment: PushEnvironment, previews: boolean, onlyMentions: boolean, platform: PushTokenBody['platform'] = 'apns'): PushTokenBody {
  return { platform, token, environment: platform === 'fcm' ? 'production' : environment, previews, only_mentions: onlyMentions };
}

/** The number on the app icon: unread mentions, never negative, and 0 clears it. */
export function badgeOf(unreadMentions: number): number {
  return Math.max(0, Math.floor(unreadMentions));
}

/** The environment this build registers its tokens for, from the build's config (`extra.pushEnvironment`). */
export function environmentOf(configured: unknown): PushEnvironment {
  return configured === 'sandbox' ? 'sandbox' : 'production';
}

export type PushStatus = 'unavailable' | PermissionState;

/** What the settings page says about push. */
export function statusLabel(status: PushStatus, settingsName = 'iOS Settings'): string {
  switch (status) {
    case 'granted':
      return 'On';
    case 'denied':
      return `Off in ${settingsName}`;
    case 'undetermined':
      return 'Not turned on yet';
    case 'unavailable':
      return 'Not available in Expo Go';
  }
}
