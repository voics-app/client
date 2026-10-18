/** UI-facing commands: wrap API calls with consistent error toasts. */
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { ChannelType } from '@shared/contracts/rest';
import { ApiError } from '@renderer/infrastructure/http/httpClient';
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
