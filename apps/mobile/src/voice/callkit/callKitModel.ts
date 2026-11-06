/** Pure rules that turn the app's call state into what the system call UI should show. */
import type { CallState } from '@discordy/core/application/stores/voiceStore';
import type { Channel, User } from '@discordy/core/contracts/rest';
import { ChannelType } from '@discordy/core/contracts/rest';
import { callerOf, isRingingFor, type DmCall } from '@discordy/core/domain/calls';

export interface RingingCall {
  channelId: string;
  /** The caller's name; null for a private call, whose name must not appear on a lock screen. */
  callerName: string | null;
  isPrivate: boolean;
}

export interface ActiveCall {
  channelId: string;
  title: string;
  connected: boolean;
}

/** Everything the controller needs to reconcile the system call UI with the app. */
export interface CallSnapshot {
  signedIn: boolean;
  /** When the gateway last became ready (ms), or null while it is not. Calls that vanish are only believed after it has settled. */
  gatewayReadyAt: number | null;
  ringing: RingingCall[];
  active: ActiveCall | null;
  selfMute: boolean;
}

/** The gateway sends the calls a user rings for right after READY; a call missing before this long has passed is not yet known to be over. */
export const GATEWAY_SETTLE_MS = 4000;
/** A call answered in the system UI must reach the app's call state within this long, or the system call is ended. */
export const ANSWER_JOIN_MS = 20_000;
/** The gateway rings for 30 seconds. */
export const RING_SECONDS = 30;

const isDm = (channel: Channel | undefined): boolean => channel?.type === ChannelType.DM || channel?.type === ChannelType.GROUP_DM;

export interface SnapshotInput {
  me: string | null;
  signedIn: boolean;
  gatewayReadyAt: number | null;
  calls: Record<string, DmCall>;
  channels: Record<string, Channel>;
  call: Pick<CallState, 'status' | 'channelId'>;
  selfMute: boolean;
  /** The name of a conversation, as the app shows it. */
  titleOf(channel: Channel): string;
}

/** Only a conversation whose delivery mode is exactly `standard` may show who is calling on a lock screen (the allow-list the push uses). */
const isStandard = (channel: Channel | undefined): boolean => channel?.delivery_mode === 'standard';

export function callSnapshot(input: SnapshotInput): CallSnapshot {
  const { me, channels } = input;
  const ringing: RingingCall[] = [];
  if (me) {
    for (const call of Object.values(input.calls)) {
      if (!isRingingFor(call, me)) continue;
      const channel = channels[call.channelId];
      const callerId = callerOf(call, me);
      const caller: User | undefined = channel?.recipients?.find((user) => user.id === callerId) ?? channel?.recipients?.[0];
      const named = isStandard(channel) && caller ? caller.global_name || caller.username : null;
      ringing.push({ channelId: call.channelId, callerName: named, isPrivate: !isStandard(channel) });
    }
  }
  const { status, channelId } = input.call;
  const inCall = status !== 'idle' && status !== 'failed' && channelId !== null;
  const channel = channelId ? channels[channelId] : undefined;
  const active: ActiveCall | null = inCall && channelId && isDm(channel) && channel ? { channelId, title: isStandard(channel) ? input.titleOf(channel) : '', connected: status === 'connected' } : null;
  return { signedIn: input.signedIn, gatewayReadyAt: input.gatewayReadyAt, ringing, active, selfMute: input.selfMute };
}
