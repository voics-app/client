/** Accept and decline for a DM call that is ringing for the user. */
import { GatewayOp } from '@discordy/core/contracts/gateway';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useCallStore } from '@discordy/core/application/stores/callStore';
import { callConfirmation, callRingPayload, callTargetName, needsCallConfirmation, ringingCallFor } from '@discordy/core/domain/calls';
import { getRuntime } from './runtime';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { attempt } from './actions';
import { openChannel } from './navigation';
import { joinVoiceChannel, toggleCamera } from './voiceActions';

export function acceptCall(channelId: string): void {
  const me = useSessionStore.getState().user?.id;
  if (me) useCallStore.getState().stopRinging(channelId, me);
  void joinVoiceChannel(null, channelId);
}

export function declineCall(channelId: string): void {
  const me = useSessionStore.getState().user?.id;
  if (me) useCallStore.getState().stopRinging(channelId, me);
  getRuntime().gateway.send(GatewayOp.CALL_DECLINE, { channel_id: channelId });
}

/** Rings recipients of a DM or group DM into its running call. */
export function ringIntoCall(channelId: string, userIds: readonly string[]): void {
  const payload = callRingPayload(channelId, userIds);
  if (payload) getRuntime().gateway.send(GatewayOp.CALL_RING, payload);
}

/** Opens (or creates) the DM with a user, joins its call and optionally turns the camera on. */
export async function callUser(userId: string, video = false): Promise<void> {
  const channel = await attempt(() => getRuntime().api.openPrivateChannel([userId]), 'Could not open conversation');
  if (!channel) return;
  useGuildStore.getState().upsertChannel(channel);
  openChannel(channel.id);
  await startDmCall(channel.id, video);
}

function ringingChannel(): string | null {
  const me = useSessionStore.getState().user?.id;
  return me ? (ringingCallFor(useCallStore.getState().calls, me)?.channelId ?? null) : null;
}

/** Keybind targets: answer or decline the call that is ringing for the user, if any. */
export function answerRingingCall(): void {
  const id = ringingChannel();
  if (id) acceptCall(id);
}

export function declineRingingCall(): void {
  const id = ringingChannel();
  if (id) declineCall(id);
}

/**
 * Starts or joins the call of an open DM; with `video` the camera goes on once connected.
 * Starting a call nobody is in yet asks first when "Confirm before calling" is on.
 */
export async function startDmCall(channelId: string, video = false): Promise<void> {
  const channel = useGuildStore.getState().channels[channelId];
  if (channel && needsCallConfirmation(usePrefsStore.getState().confirmCalls, useCallStore.getState().calls[channelId])) {
    useUiStore.getState().openDialog({ kind: 'confirm', ...callConfirmation(callTargetName(channel), video), onConfirm: () => beginDmCall(channelId, video) });
    return;
  }
  await beginDmCall(channelId, video);
}

async function beginDmCall(channelId: string, video: boolean): Promise<void> {
  const joined = await attempt(async () => {
    await joinVoiceChannel(null, channelId);
    return true;
  }, 'Could not start call');
  if (joined && video && !useVoiceStore.getState().selfVideo) await attempt(() => toggleCamera(), 'Could not turn the camera on');
}
