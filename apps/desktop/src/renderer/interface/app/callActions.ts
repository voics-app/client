/** Accept and decline for a DM call that is ringing for the user. */
import { GatewayOp } from '@shared/contracts/gateway';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useCallStore } from '@renderer/application/stores/callStore';
import { ringingCallFor } from '@renderer/domain/calls';
import { getRuntime } from './runtime';
import { joinVoiceChannel } from './voiceActions';

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
