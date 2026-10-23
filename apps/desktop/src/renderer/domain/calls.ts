/** DM call ringing: pure helpers over the call object that the gateway sends (CALL_CREATE / CALL_UPDATE). */
import type { CallEvent } from '@shared/contracts/gateway';
import type { Snowflake, VoiceState } from '@shared/contracts/rest';

export interface DmCall {
  channelId: Snowflake;
  region: string;
  ringing: Snowflake[];
  voiceStates: VoiceState[];
}

export function dmCallOf(event: CallEvent): DmCall {
  return { channelId: event.channel_id, region: event.region, ringing: event.ringing, voiceStates: event.voice_states };
}

/** The user is being rung for the call and has not joined it. */
export function isRingingFor(call: DmCall, userId: Snowflake): boolean {
  return call.ringing.includes(userId) && !call.voiceStates.some((state) => state.user_id === userId && state.channel_id !== null);
}

/** The user is in the call and is waiting for someone else to pick up: the caller's ringback. */
export function isRingingOut(call: DmCall, userId: Snowflake): boolean {
  const joined = call.voiceStates.filter((state) => state.channel_id !== null);
  return call.ringing.some((id) => id !== userId) && joined.length === 1 && joined[0]?.user_id === userId;
}

/** The participant who started the call (the first one who is not the user). */
export function callerOf(call: DmCall, userId: Snowflake): Snowflake | null {
  return call.voiceStates.find((state) => state.user_id !== userId)?.user_id ?? null;
}

/** A call is joinable from a DM when someone is already in it. */
export function hasParticipants(call: DmCall | undefined): boolean {
  return Boolean(call && call.voiceStates.some((state) => state.channel_id !== null));
}

/** The first call currently ringing for the user (keybind answer/decline target). */
export function ringingCallFor(calls: Record<Snowflake, DmCall>, userId: Snowflake): DmCall | null {
  return Object.values(calls).find((call) => isRingingFor(call, userId)) ?? null;
}
