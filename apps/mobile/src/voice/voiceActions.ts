import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { getRuntime } from '../runtime';
import { CAMERA_DENIED } from './nativeVoice';

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

/** Turns your camera on or off. When access is off it says so and offers the Settings app, where the permission lives. */
export async function toggleCamera(): Promise<void> {
  try {
    await getRuntime().voice?.controller.toggleVideo();
  } catch (error) {
    const message = errorMessage(error);
    if (message === CAMERA_DENIED) {
      Alert.alert('Camera is off', message, [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() }]);
    } else Alert.alert('Camera', message);
  }
}

/** Flips between the front and the back camera. */
export function switchCamera(): void {
  getRuntime().voice?.controller.switchCamera();
}

export function toggleScreenShare(): void {
  const share = getRuntime().voice?.controller.screenShare;
  if (!share) return;
  if (share.status !== 'idle') { void share.stop(); return; }
  Alert.alert('Share your screen', 'People in this call can see everything on your screen, including notifications. iOS will ask you to start the broadcast. Your microphone keeps its current mute setting.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Continue', onPress: () => { void share.start().catch((error) => Alert.alert('Screen sharing', errorMessage(error))); } },
  ]);
}

/** Opens the call screen for a voice channel or a conversation; the screen joins on its own. With `video` the camera turns on once the call is connected. */
export function openCallScreen(channelId: string, options: { video?: boolean } = {}): void {
  router.push(options.video ? `/voice/${channelId}?video=1` : `/voice/${channelId}`);
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
