/** UI-facing commands: wrap API calls with consistent error toasts. */
import { deleteGuild as deleteGuildCommand, leaveGuild as leaveGuildCommand, markChannelRead as markChannelReadCommand, markGuildRead as markGuildReadCommand, saveRail as saveRailCommand } from '@discordy/core/application/guildCommands';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { forwardBody } from '@discordy/core/domain/forward';
import { idBefore } from '@discordy/core/domain/unread';
import type { GuildFolder, Message } from '@discordy/core/contracts/rest';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { openChannel } from './navigation';
import { getRuntime } from './runtime';

export { errorMessage };

export function reportError(error: unknown, title = 'Something went wrong'): void {
  useUiStore.getState().toast({ tone: 'danger', title, body: errorMessage(error) });
}

/** Runs an async command; resolves to its value or undefined after toasting the failure. */
export async function attempt<T>(run: () => Promise<T>, title?: string): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    reportError(error, title);
    return undefined;
  }
}

export const markChannelRead = (channelId: string): void => markChannelReadCommand(getRuntime().api, channelId);

export const markGuildRead = (guildId: string): void => markGuildReadCommand(getRuntime().api, guildId);

/** Applies a new server-rail layout locally right away, then syncs it to the user's other devices. */
export async function saveRail(rail: GuildFolder[]): Promise<void> {
  await attempt(() => saveRailCommand(getRuntime().api, rail), 'Could not save server order');
}

export async function leaveGuild(guildId: string): Promise<void> {
  await leaveGuildCommand(getRuntime().api, guildId);
  useUiStore.getState().navigate({ kind: 'home', channelId: null });
}

export async function deleteGuild(guildId: string): Promise<void> {
  await deleteGuildCommand(getRuntime().api, guildId);
  useUiStore.getState().navigate({ kind: 'home', channelId: null });
}

export async function copyText(text: string, label = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    useUiStore.getState().toast({ tone: 'success', title: label });
  } catch {
    reportError(new Error('Clipboard is unavailable.'), 'Could not copy');
  }
}

/** Opens the channel and scrolls to (and flashes) the message, loading history around it when it is not in memory. */
/** Forwards a message into another chat: the server snapshots it, so the copy keeps working if the original goes away. Resolves to whether it was sent. */
export async function forwardMessage(message: Message, targetChannelId: string, comment: string): Promise<boolean> {
  const sent = await attempt(() => getRuntime().api.sendMessage(targetChannelId, forwardBody(message, comment, `fwd-${Date.now().toString(36)}`)), 'Could not forward message');
  if (!sent) return false;
  useMessageStore.getState().receive(sent);
  useUiStore.getState().toast({ tone: 'success', title: 'Message forwarded' });
  return true;
}

export function jumpToMessage(channelId: string, messageId: string): void {
  useReadNavStore.getState().requestJump(channelId, messageId);
  const ui = useUiStore.getState();
  if (ui.view.channelId !== channelId) openChannel(channelId);
}

/** Scrolls to the first unread message (the one after the marker captured for this visit). */
export function jumpToFirstUnread(channelId: string): void {
  const anchor = useReadNavStore.getState().anchors[channelId] ?? useReadStateStore.getState().byChannel[channelId]?.lastReadId;
  if (anchor) useReadNavStore.getState().requestJump(channelId, anchor, 'firstAfter');
}

/** Mark Unread: the read marker moves to just before the message, locally and on the server (all devices). */
export function markMessageUnread(channelId: string, messageId: string): void {
  const marker = idBefore(messageId);
  useReadStateStore.getState().setPosition(channelId, marker, 0);
  useReadNavStore.getState().setAnchor(channelId, marker);
  try {
    void getRuntime()
      .api.ack(channelId, marker, { manual: true, mentionCount: 0 })
      .catch((e) => reportError(e, 'Could not mark unread'));
  } catch {
    /* runtime not started (signed out): the local marker still moved */
  }
}
