/** Accept and decline for a DM call that is ringing for the user. */
import { GatewayOp } from '@shared/contracts/gateway';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useCallStore } from '@renderer/application/stores/callStore';
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
