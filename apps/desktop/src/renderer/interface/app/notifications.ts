import type { ChatMessage } from '@renderer/application/stores/messageStore';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { toPlainText, parseMarkdown } from '@renderer/domain/markdown';
import { bridge } from './bridge';

function activeChannelId(): string | null {
  const view = useUiStore.getState().view;
  return view.channelId;
}

export function totalMentions(): number {
  return Object.values(useReadStateStore.getState().byChannel).reduce((sum, r) => sum + r.mentionCount, 0);
}

/** Desktop notification, taskbar flash and badge for an incoming message. */
export function notifyIncoming(message: ChatMessage): void {
  const me = useSessionStore.getState().user;
  if (!me || message.author.id === me.id) return;
  const prefs = usePrefsStore.getState();
  bridge?.app.setBadgeCount(totalMentions());
  if (prefs.mutedChannels[message.channel_id]) return;
  const focused = document.hasFocus() && activeChannelId() === message.channel_id;
  if (focused) return;
  const mentioned = message.mentions.some((u) => u.id === me.id) || message.mention_everyone || !message.guild_id;
  if (prefs.notifyOnlyMentions && !mentioned) return;
  if (!prefs.notifyDesktop || !mentioned) return;
  const channel = useGuildStore.getState().channels[message.channel_id];
  const title = message.guild_id ? `${message.author.global_name ?? message.author.username} in #${channel?.name ?? 'channel'}` : (message.author.global_name ?? message.author.username);
  const body = toPlainText(parseMarkdown(message.content)).slice(0, 180) || 'Sent an attachment';
  const route = message.guild_id ? `/channels/${message.guild_id}/${message.channel_id}` : `/channels/@me/${message.channel_id}`;
  bridge?.app.notify({ title, body, route, silent: !prefs.notifySounds });
  if (prefs.flashTaskbar) bridge?.app.flashFrame();
}
