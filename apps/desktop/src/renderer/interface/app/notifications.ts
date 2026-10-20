import type { ChatMessage } from '@renderer/application/stores/messageStore';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { isMentioned, levelFromPrefs, shouldNotify } from '@renderer/domain/notificationPolicy';
import { summarizeActivity } from '@renderer/domain/unread';
import { toPlainText, parseMarkdown } from '@renderer/domain/markdown';
import { ChannelType } from '@shared/contracts/rest';
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
  return summarizeActivity(channels, useReadStateStore.getState().byChannel, usePrefsStore.getState().mutedChannels);
}

/** Desktop notification and taskbar flash for an incoming message, following the notification rules. */
export function notifyIncoming(message: ChatMessage): void {
  const me = useSessionStore.getState().user;
  if (!me || message.author.id === me.id) return;
  const prefs = usePrefsStore.getState();
  const myRoleIds = (message.guild_id ? useGuildStore.getState().members[message.guild_id]?.[me.id]?.roles : undefined) ?? [];
  const mentioned = isMentioned(message, { meId: me.id, myRoleIds });
  const notify = shouldNotify({
    mentioned,
    level: levelFromPrefs(prefs.notifyOnlyMentions),
    muted: Boolean(prefs.mutedChannels[message.channel_id]),
    viewingChannel: document.hasFocus() && activeChannelId() === message.channel_id,
    desktopEnabled: prefs.notifyDesktop,
    doNotDisturb: useSessionStore.getState().settings.status === 'dnd',
  });
  if (!notify) return;
  const channel = useGuildStore.getState().channels[message.channel_id];
  const title = message.guild_id ? `${message.author.global_name ?? message.author.username} in #${channel?.name ?? 'channel'}` : (message.author.global_name ?? message.author.username);
  const body = toPlainText(parseMarkdown(message.content)).slice(0, 180) || 'Sent an attachment';
  const route = message.guild_id ? `/channels/${message.guild_id}/${message.channel_id}` : `/channels/@me/${message.channel_id}`;
  bridge?.app.notify({ title, body, route, silent: !prefs.notifySounds });
  if (prefs.flashTaskbar) bridge?.app.flashFrame();
}
