import { ChatsCircle, X } from '@phosphor-icons/react';
import { create } from 'zustand';
import type { Channel } from '@shared/contracts/rest';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { getRuntime } from '../../app/runtime';
import { IconButton } from '../../shared/ui/IconButton';
import { Composer } from '../chat/Composer';
import { MessageList } from '../chat/MessageList';
import './voiceTextChat.css';

interface VoiceChatState {
  openByChannel: Record<string, boolean>;
  toggle: (channelId: string) => void;
}

/** Whether the call's side chat is open, per voice channel. Closed until the user opens it. */
export const useVoiceChatStore = create<VoiceChatState>()((set) => ({
  openByChannel: {},
  toggle: (channelId) => set((s) => ({ openByChannel: { ...s.openByChannel, [channelId]: !s.openByChannel[channelId] } })),
}));

/** Voice channels carry a text chat unless a manager switched it off. */
export function voiceTextChatEnabled(channel: Pick<Channel, 'text_chat_enabled'> | undefined): boolean {
  return Boolean(channel) && channel?.text_chat_enabled !== false;
}

/** Call-header button that opens or closes the channel's text chat. Hidden when the chat is off. */
export function VoiceChatToggle({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const open = useVoiceChatStore((s) => Boolean(s.openByChannel[channelId]));
  const toggle = useVoiceChatStore((s) => s.toggle);
  if (!voiceTextChatEnabled(channel)) return null;
  return (
    <IconButton label={open ? 'Hide chat' : 'Show chat'} size="lg" active={open} onClick={() => toggle(channelId)}>
      <ChatsCircle size={24} weight={open ? 'fill' : 'regular'} />
    </IconButton>
  );
}

/** Side panel beside the stage: the channel's messages and composer, reusing the text chat components. */
export function VoiceTextChatPanel({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const open = useVoiceChatStore((s) => Boolean(s.openByChannel[channelId]));
  const toggle = useVoiceChatStore((s) => s.toggle);
  useSessionStore((s) => s.settings); // re-resolve the mode when account defaults or overrides change
  if (!channel || !open || !voiceTextChatEnabled(channel)) return null;
  const mode = getRuntime().privacy.sender.resolveMode(channel);
  return (
    <section className="chat voice-chat-panel" aria-label={`${channel.name ?? 'Voice'} chat`}>
      <header className="voice-chat-head">
        <h2>{channel.name ?? 'Chat'}</h2>
        <IconButton label="Close chat" onClick={() => toggle(channelId)}>
          <X size={18} />
        </IconButton>
      </header>
      <MessageList channelId={channelId} />
      <Composer channel={channel} mode={mode} />
    </section>
  );
}
