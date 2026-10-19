import { beforeEach, describe, expect, it } from 'vitest';
import { useVoiceChatStore, voiceTextChatEnabled } from '@renderer/interface/features/voice/VoiceTextChat';

describe('voiceTextChatEnabled', () => {
  it('is on for voice channels that never set the flag, and off only when a manager switched it off', () => {
    expect(voiceTextChatEnabled({})).toBe(true);
    expect(voiceTextChatEnabled({ text_chat_enabled: true })).toBe(true);
    expect(voiceTextChatEnabled({ text_chat_enabled: false })).toBe(false);
  });

  it('is off when there is no channel to chat in', () => {
    expect(voiceTextChatEnabled(undefined)).toBe(false);
  });
});

describe('useVoiceChatStore', () => {
  beforeEach(() => useVoiceChatStore.setState({ openByChannel: {} }));

  it('keeps the chat panel state per channel, closed by default', () => {
    const { toggle } = useVoiceChatStore.getState();
    expect(useVoiceChatStore.getState().openByChannel['1']).toBeUndefined();
    toggle('1');
    expect(useVoiceChatStore.getState().openByChannel).toEqual({ '1': true });
    toggle('2');
    toggle('1');
    expect(useVoiceChatStore.getState().openByChannel).toEqual({ '1': false, '2': true });
  });
});
