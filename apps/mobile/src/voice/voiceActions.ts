import { router } from 'expo-router';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { getRuntime } from '../runtime';

export const VOICE_UNAVAILABLE = "Voice and calls aren't in this test version. Install the development build of Voics to use them.";

/** False in Expo Go, where the native WebRTC module does not exist. */
export function voiceAvailable(): boolean {
  return Boolean(getRuntime().voice);
}

/** Joins a voice channel or a DM call; does nothing when already in it. Failures show on the call (`call.error`). */
export async function joinVoice(guildId: string | null, channelId: string): Promise<void> {
  const voice = getRuntime().voice;
  if (!voice) return;
  const { call } = useVoiceStore.getState();
  if (call.channelId === channelId && call.status !== 'idle' && call.status !== 'failed') return;
  await voice.controller.join({ guildId, channelId });
}

export async function leaveVoice(): Promise<void> {
  await getRuntime().voice?.controller.leave();
}

export function toggleMute(): void {
  getRuntime().voice?.controller.toggleMute();
}

export function toggleDeafen(): void {
  getRuntime().voice?.controller.toggleDeaf();
}

/** Opens the call screen for a voice channel or a conversation; the screen joins on its own. */
export function openCallScreen(channelId: string): void {
  router.push(`/voice/${channelId}`);
}

/** Answers a ringing DM call: stops the ring on this device and joins. */
export function acceptCall(channelId: string): void {
  const me = useSessionStore.getState().user?.id;
  if (me) useCallStore.getState().stopRinging(channelId, me);
  openCallScreen(channelId);
}

export function declineCall(channelId: string): void {
  const me = useSessionStore.getState().user?.id;
  if (me) useCallStore.getState().stopRinging(channelId, me);
  getRuntime().gateway.send(GatewayOp.CALL_DECLINE, { channel_id: channelId });
}
