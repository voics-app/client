import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { getRuntime } from '../src/runtime';
import { MobileMic } from '../src/voice/mobileMic';
import { VoiceScreen } from '../src/voice/VoiceScreen';

// QA branch only: the real voice screen and microphone gate use an isolated fake track.
export default function VoicePttQa() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!Constants.expoConfig?.extra?.voicePttFixture) return;
    const track = { kind: 'audio', enabled: false, stop: () => {} };
    const mic = new MobileMic(async () => track);
    mic.setForcePushToTalk(true);
    void mic.start();
    const runtime = getRuntime();
    const previous = runtime.voice;
    const controller = {
      screenShare: { available: false, status: 'idle', subscribe: () => () => {} },
      join: async () => {}, leave: async () => {},
      toggleMute: () => { const muted = !useVoiceStore.getState().selfMute; mic.setSelfMute(muted); setOpen(track.enabled); useVoiceStore.getState().setSelf({ selfMute: muted }); },
      toggleDeaf: () => {}, toggleVideo: async () => {}, switchCamera: async () => {},
      setPushToTalk: (pressed: boolean) => { mic.setPushToTalk(pressed); setOpen(track.enabled); },
      subscribeFacing: () => () => {}, facing: 'front',
    };
    runtime.voice = { controller, route: { current: 'speaker', subscribe: () => () => {}, toggle: () => {} } } as never;
    useSessionStore.setState({ user: { id: 'qa-user', username: 'qa', global_name: 'QA user', avatar: null }, sessionId: 'qa-session' });
    useGuildStore.getState().hydrate([{ id: 'qa-guild', name: 'QA guild', owner_id: 'qa-owner', roles: [{ id: 'qa-guild', permissions: String((1n << 10n) | (1n << 20n)) }], members: [{ user: { id: 'qa-user', username: 'qa', global_name: 'QA user', avatar: null }, roles: [] }], channels: [{ id: 'qa-voice', guild_id: 'qa-guild', type: 2, name: 'PTT test', position: 0 }], emojis: [] } as never], []);
    useVoiceStore.setState({ selfMute: false, selfDeaf: false, requiresPtt: true });
    useVoiceStore.getState().setCall({ status: 'connected', guildId: 'qa-guild', channelId: 'qa-voice' });
    setReady(true);
    return () => { mic.stop(); runtime.voice = previous; };
  }, []);
  if (!Constants.expoConfig?.extra?.voicePttFixture) return null;
  if (!ready) return null;
  return <View style={{ flex: 1 }}><Text accessibilityLabel={open ? 'Microphone open' : 'Microphone closed'}>{open ? 'Microphone open' : 'Microphone closed'}</Text><VoiceScreen channelId="qa-voice" /></View>;
}
