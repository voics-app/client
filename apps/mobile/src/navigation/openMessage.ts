import { openChat } from './openChat';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';

export interface MessageTarget {
  /** Null or absent for a direct or group conversation. */
  guildId?: string | null;
  channelId: string;
  messageId: string;
}

/** Opens a chat and scrolls to one message in it (an inbox entry, a banner, a pin, a search hit). The chat loads the surrounding window when the message is not in memory. */
export function openMessage({ guildId, channelId, messageId }: MessageTarget): void {
  useReadNavStore.getState().requestJump(channelId, messageId);
  openChat({ guildId, channelId });
}
