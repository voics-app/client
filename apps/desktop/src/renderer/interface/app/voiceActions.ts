/** Thin command facade over the voice engine so UI never imports engine classes directly. */
import type { VideoPresetId } from '@discordy/core/domain/videoPresets';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType } from '@discordy/core/contracts/rest';
import { reportError } from './actions';
import { openChannel } from './navigation';
import { getRuntime } from './runtime';

export type ShareResult = { ok: true } | { ok: false; reason: 'protected_content' | 'cancelled' | 'error'; message?: string };

export interface VoiceFacade {
  join(guildId: string | null, channelId: string): Promise<void>;
  leave(): Promise<void>;
  setMute(muted: boolean): Promise<void>;
  setDeaf(deafened: boolean): Promise<void>;
  setCamera(enabled: boolean): Promise<void>;
  requestToSpeak(requested: boolean): Promise<void>;
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
  if (useGuildStore.getState().channels[channelId]?.type === ChannelType.GUILD_STAGE_VOICE) return;
  const call = useVoiceStore.getState().call;
  if (call.channelId === channelId && call.status !== 'idle') return;
  try {
    await require()?.join(guildId, channelId);
  } catch (error) {
    reportError(error, 'Could not join voice');
  }
}

/** Joins a stage with local capture muted before the voice handshake. */
export async function joinStageAudience(guildId: string, channelId: string): Promise<void> {
  if (useGuildStore.getState().channels[channelId]?.type !== ChannelType.GUILD_STAGE_VOICE) return;
  const call = useVoiceStore.getState().call;
  if (call.channelId === channelId && call.status !== 'idle') return;
  const voice = require();
  if (!voice) return;
  try {
    await voice.setMute(true);
    await voice.join(guildId, channelId);
  } catch (error) {
    reportError(error, 'Could not join stage');
  }
}

export async function requestStageSpeak(requested: boolean): Promise<void> {
  await run(() => require()?.requestToSpeak(requested));
}

export async function setStageAudience(guildId: string, userId: string, suppress: boolean): Promise<void> {
  try {
    await getRuntime().api.updateMember(guildId, userId, { suppress });
  } catch (error) {
    reportError(error, suppress ? 'Could not move member to audience' : 'Could not invite member to speak');
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
  const { selfMute, call, states } = useVoiceStore.getState();
  const userId = useSessionStore.getState().user?.id;
  const isStage = call.channelId && useGuildStore.getState().channels[call.channelId]?.type === ChannelType.GUILD_STAGE_VOICE;
  const selfState = userId && call.guildId ? states[call.guildId]?.[userId] : undefined;
  if (selfMute && isStage && (selfState?.channel_id !== call.channelId || selfState.suppress !== false)) {
    useUiStore.getState().toast({ tone: 'info', title: 'Audience members are muted', body: 'You can listen while muted.' });
    return;
  }
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
