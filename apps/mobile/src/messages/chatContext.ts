import { createContext, useContext } from 'react';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';

/** What the rendered text of a channel needs from its screen: the guild for names and colours, and what a tap on a mention, link or reply does. */
export interface ChatContextValue {
  guildId: string | undefined;
  canManageMessages: boolean;
  onPressUser(userId: string): void;
  onPressChannel(channelId: string): void;
  onJumpToMessage(messageId: string): void;
  /** Sends a wave in reply to a join message. */
  onWave(messageId: string): void;
  /** Whether the user may add reactions here; the + chip only shows then. */
  canReact: boolean;
  /** Opens the emoji picker to add a reaction to a message. */
  onMoreReactions(messageId: string): void;
  /** Opens the list of people who reacted with one emoji (its `reactionKey`). */
  onWhoReacted(messageId: string, emoji: string): void;
  /** Whether the user may reply here; swiping a message left only replies then. */
  canReply: boolean;
  onReplyTo(message: ChatMessage): void;
  /** Opens the pinned messages of this channel (the link in a pin system message). */
  onOpenPins(): void;
  /** Opens a thread (the link in a thread system message). */
  onOpenThread(threadId: string): void;
}

const NOOP: ChatContextValue = {
  guildId: undefined,
  canManageMessages: false,
  onPressUser: () => undefined,
  onPressChannel: () => undefined,
  onJumpToMessage: () => undefined,
  onWave: () => undefined,
  canReact: false,
  onMoreReactions: () => undefined,
  onWhoReacted: () => undefined,
  canReply: false,
  onReplyTo: () => undefined,
  onOpenPins: () => undefined,
  onOpenThread: () => undefined,
};

export const ChatContext = createContext<ChatContextValue>(NOOP);
export const useChatContext = () => useContext(ChatContext);

/** A context for screens that show messages outside a chat (pins, search): names and colours of the server, and taps that do nothing. */
export const chatContextFor = (guildId: string | undefined): ChatContextValue => ({ ...NOOP, guildId });
