import { router } from 'expo-router';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useInviteLinkStore } from '../invites/inviteLinkStore';
import { isWideNow } from '../shell/layoutModel';

export interface ChatTarget {
  /** Null or absent for a direct or group conversation. */
  guildId?: string | null;
  channelId: string;
}

export const chatPath = ({ guildId, channelId }: ChatTarget): `/servers/${string}/${string}` | `/dms/${string}` => (guildId ? `/servers/${guildId}/${channelId}` : `/dms/${channelId}`);

function showPendingScreening(guildId: string): boolean {
  const userId = useSessionStore.getState().user?.id;
  if (!userId || !useGuildStore.getState().members[guildId]?.[userId]?.pending) return false;
  useInviteLinkStore.getState().openScreening(guildId);
  return true;
}

/**
 * Opens a chat from the channel list. On a phone it slides in over the list; beside the list (tablet) it replaces the chat shown there, so picking
 * channels one after another does not pile screens up.
 */
export function openChat(target: ChatTarget): void {
  if (target.guildId && showPendingScreening(target.guildId)) return;
  if (isWideNow()) router.replace(chatPath(target));
  else router.push(chatPath(target));
}

/** Selects a server in the rail. Beside the chat (tablet) it opens the channel you were last in, as on desktop; otherwise, and on a phone, it shows the server's channel list. */
export function openGuild(guildId: string): void {
  if (showPendingScreening(guildId)) return;
  const ui = useUiStore.getState();
  const last = ui.lastChannelByGuild[guildId];
  if (isWideNow() && last) openChat({ guildId, channelId: last });
  else ui.navigate({ kind: 'guild', guildId, channelId: null });
}
