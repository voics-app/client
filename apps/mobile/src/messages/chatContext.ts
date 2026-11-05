import { createContext, useContext } from 'react';

/** What the rendered text of a channel needs from its screen: the guild for names and colours, and what a tap on a mention, link or reply does. */
export interface ChatContextValue {
  guildId: string | undefined;
  canManageMessages: boolean;
  onPressUser(userId: string): void;
  onPressChannel(channelId: string): void;
  onJumpToMessage(messageId: string): void;
  /** Sends a wave in reply to a join message. */
  onWave(messageId: string): void;
}

const NOOP: ChatContextValue = {
  guildId: undefined,
  canManageMessages: false,
  onPressUser: () => undefined,
  onPressChannel: () => undefined,
  onJumpToMessage: () => undefined,
  onWave: () => undefined,
};

export const ChatContext = createContext<ChatContextValue>(NOOP);
export const useChatContext = () => useContext(ChatContext);
