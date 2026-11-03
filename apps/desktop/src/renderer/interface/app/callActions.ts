/** Accept and decline for a DM call that is ringing for the user. */
import { GatewayOp } from '@shared/contracts/gateway';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useCallStore } from '@renderer/application/stores/callStore';
import { ringingCallFor } from '@renderer/domain/calls';
import { getRuntime } from './runtime';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
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

/** Opens (or creates) the DM with a user, joins its call and optionally turns the camera on. */
export async function callUser(userId: string, video = false): Promise<void> {
  const channel = await attempt(() => getRuntime().api.openPrivateChannel([userId]), 'Could not open conversation');
  if (!channel) return;
  useGuildStore.getState().upsertChannel(channel);
  openChannel(channel.id);
  await attempt(() => joinVoiceChannel(null, channel.id), 'Could not start call');
  if (video && !useVoiceStore.getState().selfVideo) await toggleCamera();
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

/** Starts or joins the call of an open DM; with `video` the camera goes on once connected. */
export async function startDmCall(channelId: string, video = false): Promise<void> {
  const joined = await attempt(async () => {
    await joinVoiceChannel(null, channelId);
    return true;
  }, 'Could not start call');
  if (joined && video && !useVoiceStore.getState().selfVideo) await attempt(() => toggleCamera(), 'Could not turn the camera on');
}
