/** Thin command facade over the voice engine so UI never imports engine classes directly. */
import type { VideoPresetId } from '@renderer/domain/videoPresets';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { reportError } from './actions';
import { openChannel } from './navigation';

export type ShareResult = { ok: true } | { ok: false; reason: 'protected_content' | 'cancelled' | 'error'; message?: string };

export interface VoiceFacade {
  join(guildId: string | null, channelId: string): Promise<void>;
  leave(): Promise<void>;
  setMute(muted: boolean): Promise<void>;
  setDeaf(deafened: boolean): Promise<void>;
  setCamera(enabled: boolean): Promise<void>;
  startScreenShare(options: { sourceId: string; audio: boolean; preset: VideoPresetId }): Promise<ShareResult>;
  stopScreenShare(): Promise<void>;
  setScreenPreset(preset: VideoPresetId): Promise<void>;
  setUserVolume(userId: string, volume: number): void;
}

let facade: VoiceFacade | null = null;

export function registerVoice(next: VoiceFacade | null): void {
  facade = next;
}

function require(): VoiceFacade | null {
  if (!facade) useUiStore.getState().toast({ tone: 'warning', title: 'Voice is unavailable', body: 'The voice engine has not started yet.' });
  return facade;
}

export async function joinVoiceChannel(guildId: string | null, channelId: string): Promise<void> {
  const call = useVoiceStore.getState().call;
  if (call.channelId === channelId && call.status !== 'idle') return;
  try {
    await require()?.join(guildId, channelId);
  } catch (error) {
    reportError(error, 'Could not join voice');
  }
}

/** Joins a voice channel and switches to its call view. Clicking it again while connected just reopens the view. */
export async function openVoiceChannel(guildId: string | null, channelId: string): Promise<void> {
  openChannel(channelId);
  await joinVoiceChannel(guildId, channelId);
}

export async function leaveVoice(): Promise<void> {
  try {
    await require()?.leave();
  } catch (error) {
    reportError(error, 'Could not leave voice');
  }
}

export async function toggleMute(): Promise<void> {
  const { selfMute } = useVoiceStore.getState();
  await run(() => require()?.setMute(!selfMute));
}

export async function toggleDeafen(): Promise<void> {
  const { selfDeaf } = useVoiceStore.getState();
  await run(() => require()?.setDeaf(!selfDeaf));
}

export async function toggleCamera(): Promise<void> {
  const { selfVideo } = useVoiceStore.getState();
  await run(() => require()?.setCamera(!selfVideo));
}

export async function startShare(options: { sourceId: string; audio: boolean; preset: VideoPresetId }): Promise<ShareResult> {
  const f = require();
  if (!f) return { ok: false, reason: 'error', message: 'Voice is unavailable' };
  try {
    return await f.startScreenShare(options);
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : 'Screen share failed' };
  }
}

export async function stopShare(): Promise<void> {
  await run(() => require()?.stopScreenShare());
}

export async function changePreset(preset: VideoPresetId): Promise<void> {
  useVoiceStore.getState().setSelf({ streamPreset: preset });
  if (useVoiceStore.getState().selfStream) await run(() => require()?.setScreenPreset(preset));
}

export function setUserVolume(userId: string, volume: number): void {
  useVoiceStore.getState().setUserVolume(userId, volume);
  facade?.setUserVolume(userId, volume);
}

async function run(fn: () => Promise<void> | undefined): Promise<void> {
  try {
    await fn();
  } catch (error) {
    reportError(error, 'Voice error');
  }
}

let heldMute = false;

/** Push to mute: mutes while the key is held and restores the mic on release (only if it was live when pressed). */
export async function pushToMute(pressed: boolean): Promise<void> {
  if (pressed) {
    if (heldMute || useVoiceStore.getState().selfMute) return;
    heldMute = true;
    await run(() => require()?.setMute(true));
  } else if (heldMute) {
    heldMute = false;
    await run(() => require()?.setMute(false));
  }
}

/** Stops the running screen share, or opens the source picker to start one. Only while in a call. */
export function toggleScreenShare(): void {
  const { selfStream, call } = useVoiceStore.getState();
  if (selfStream) void stopShare();
  else if (call.status !== 'idle') useUiStore.getState().openDialog({ kind: 'screenPicker' });
}
