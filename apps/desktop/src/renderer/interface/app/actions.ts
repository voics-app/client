/** UI-facing commands: wrap API calls with consistent error toasts. */
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { forwardBody } from '@discordy/core/domain/forward';
import { idBefore } from '@discordy/core/domain/unread';
import { flatten } from '@discordy/core/domain/railLayout';
import { ChannelType, type GuildFolder, type Message } from '@discordy/core/contracts/rest';
import { ApiError } from '@renderer/infrastructure/http/httpClient';
import { openChannel } from './navigation';
import { getRuntime } from './runtime';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.status === 0 ? 'You appear to be offline.' : error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}

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

export function markChannelRead(channelId: string): void {
  const channel = useGuildStore.getState().channels[channelId];
  const last = channel?.last_message_id;
  if (!last) return;
  const read = useReadStateStore.getState().byChannel[channelId];
  if (read?.lastReadId === last && read.mentionCount === 0) return;
  useReadStateStore.getState().markRead(channelId, last);
  void getRuntime().api.ack(channelId, last).catch(() => undefined);
}

export function markGuildRead(guildId: string): void {
  for (const c of Object.values(useGuildStore.getState().channels)) {
    if (c.guild_id === guildId && c.type === ChannelType.GUILD_TEXT) markChannelRead(c.id);
  }
}

/** Applies a new server-rail layout locally right away, then syncs it to the user's other devices. */
export async function saveRail(rail: GuildFolder[]): Promise<void> {
  const store = useGuildStore.getState();
  const previous = store.rail;
  store.setRail(rail);
  const next = useGuildStore.getState().rail;
  const saved = await attempt(
    () => getRuntime().api.updateSettings({ guild_folders: next, guild_positions: flatten(next) }),
    'Could not save server order',
  );
  if (!saved) useGuildStore.getState().setRail(previous);
}

export async function leaveGuild(guildId: string): Promise<void> {
  const me = useSessionStore.getState().user?.id;
  if (!me) return;
  await getRuntime().api.kickMember(guildId, me);
  useGuildStore.getState().removeGuild(guildId);
  useUiStore.getState().navigate({ kind: 'home', channelId: null });
}

export async function deleteGuild(guildId: string): Promise<void> {
  await getRuntime().api.deleteGuild(guildId);
  useGuildStore.getState().removeGuild(guildId);
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
