import type { Message } from '@discordy/core/contracts/rest';
import { speak } from '@renderer/infrastructure/tts';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';

/** Reads a text-to-speech message aloud when the person allows it and is looking at that channel. */
export function readAloudIfWanted(message: Message, meId: string | undefined): boolean {
  if (!message.tts || message.author.id === meId) return false;
  const prefs = usePrefsStore.getState();
  if (!prefs.ttsReadAloud || useUiStore.getState().view.channelId !== message.channel_id) return false;
  return speak(`${message.author.global_name ?? message.author.username} says ${message.content}`, prefs.ttsRate);
}
