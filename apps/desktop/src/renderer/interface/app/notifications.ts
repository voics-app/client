import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { isMentioned, isSilent, shouldAlert, type NotifyLevel } from '@discordy/core/domain/notificationPolicy';
import { effectiveLevelDeep, isChannelMutedDeep, scopeKey, serverDefaultLevel } from '@discordy/core/domain/notificationSettings';
import { summarizeActivity } from '@discordy/core/domain/unread';
import { toPlainText, parseMarkdown } from '@discordy/core/domain/markdown';
import { shouldPlaySound } from '@discordy/core/domain/sounds';
import { soundEffects } from '@renderer/infrastructure/audio/sfx';
import { ChannelType } from '@discordy/core/contracts/rest';
import { bridge } from './bridge';

function activeChannelId(): string | null {
  const view = useUiStore.getState().view;
  return view.channelId;
}

export function totalMentions(): number {
  return Object.values(useReadStateStore.getState().byChannel).reduce((sum, r) => sum + r.mentionCount, 0);
}

/** Current unread/mention totals over every text channel the viewer can see. */
export function currentActivity(): { mentions: number; unread: number } {
  const channels = Object.values(useGuildStore.getState().channels).filter((c) => c.type === ChannelType.GUILD_TEXT || c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM);
  const now = Date.now();
  const byScope = useNotificationSettingsStore.getState().byScope;
  const muted = Object.fromEntries(channels.map((c) => [c.id, isChannelMutedDeep(byScope[scopeKey(c.guild_id)], c, now)]));
  return summarizeActivity(channels, useReadStateStore.getState().byChannel, muted);
}

/** Desktop notification and taskbar flash for an incoming message, following the notification rules. */
export function notifyIncoming(message: ChatMessage): void {
  const me = useSessionStore.getState().user;
  if (!me || message.author.id === me.id || isSilent(message)) return;
  const prefs = usePrefsStore.getState();
  const channel = useGuildStore.getState().channels[message.channel_id];
  const settings = useNotificationSettingsStore.getState().byScope[scopeKey(message.guild_id)];
  const guildDefault = serverDefaultLevel(message.guild_id ? useGuildStore.getState().guilds[message.guild_id]?.default_message_notifications : 0);
  const synced = effectiveLevelDeep(settings, { id: message.channel_id, parent_id: channel?.parent_id }, guildDefault);
  const level: NotifyLevel = synced === 2 ? 'none' : synced === 1 || prefs.notifyOnlyMentions ? 'mentions' : 'all';
  const myRoleIds = (message.guild_id ? useGuildStore.getState().members[message.guild_id]?.[me.id]?.roles : undefined) ?? [];
  const mentioned = isMentioned(message, { meId: me.id, myRoleIds, suppressEveryone: settings?.suppress_everyone, suppressRoles: settings?.suppress_roles });
  const doNotDisturb = useSessionStore.getState().settings.status === 'dnd';
  const alert = shouldAlert({
    mentioned,
    level,
    muted: isChannelMutedDeep(settings, { id: message.channel_id, parent_id: channel?.parent_id }, Date.now()),
    viewingChannel: document.hasFocus() && activeChannelId() === message.channel_id,
    doNotDisturb,
  });
  if (!alert) return;
  // The sound is ours (a toast's own sound depends on the OS and is off for background apps), so it
  // plays whether or not desktop notifications are enabled.
  if (shouldPlaySound('message', { enabled: prefs.notifySounds, toggles: prefs.soundToggles, doNotDisturb })) {
    soundEffects.play('message', prefs.outputVolume, prefs.outputDeviceId);
  }
  if (!prefs.notifyDesktop) return;
  const title = message.guild_id ? `${message.author.global_name ?? message.author.username} in #${channel?.name ?? 'channel'}` : (message.author.global_name ?? message.author.username);
  // Private (E2EE/P2P) plaintext never goes to the OS notification centre.
  const isPrivate = message.deliveryMode === 'ephemeral' || message.deliveryMode === 'p2p';
  const body = isPrivate ? 'Sent a private message' : toPlainText(parseMarkdown(message.content)).slice(0, 180) || 'Sent an attachment';
  const route = message.guild_id ? `/channels/${message.guild_id}/${message.channel_id}` : `/channels/@me/${message.channel_id}`;
  bridge?.app.notify({ title, body, route, silent: true });
  if (prefs.flashTaskbar) bridge?.app.flashFrame();
}

/** Sound for a friend request from someone else; follows the sound switches and Do Not Disturb. */
export function playFriendRequestSound(): void {
  const prefs = usePrefsStore.getState();
  const doNotDisturb = useSessionStore.getState().settings.status === 'dnd';
  if (shouldPlaySound('friendRequest', { enabled: prefs.notifySounds, toggles: prefs.soundToggles, doNotDisturb })) {
    soundEffects.play('friendRequest', prefs.outputVolume, prefs.outputDeviceId);
  }
}
