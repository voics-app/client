/** Pure rules for the voice screens: who is in a call, who is speaking, what the call says about itself, which voice channels to list. */
import type { CallState } from '@discordy/core/application/stores/voiceStore';
import type { GuildMember, User, VoiceState } from '@discordy/core/contracts/rest';
import { occupantFlags } from '@discordy/core/domain/voiceOccupant';
import { SPEAKING_THRESHOLD } from './voiceActivity';

export interface ParticipantRow {
  userId: string;
  name: string;
  user: Pick<User, 'id' | 'avatar' | 'username' | 'global_name'>;
  self: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
}

export interface ParticipantsInput {
  /** Voice states of the channel (core's `usersInChannel`). */
  states: readonly VoiceState[];
  /** Per user level (0 to 1) from the voice store. */
  speaking: Record<string, number>;
  selfId: string;
  /** Where a name can be found when the voice state carries no member. */
  members?: Record<string, GuildMember>;
  recipients?: readonly User[];
  selfUser?: User | null;
}

function userFor(state: VoiceState, input: ParticipantsInput): User | null {
  if (state.member?.user) return state.member.user;
  const member = input.members?.[state.user_id];
  if (member) return member.user;
  const recipient = input.recipients?.find((u) => u.id === state.user_id);
  if (recipient) return recipient;
  return state.user_id === input.selfId ? (input.selfUser ?? null) : null;
}

function nameFor(state: VoiceState, user: User | null, members: ParticipantsInput['members']): string {
  const nick = state.member?.nick ?? members?.[state.user_id]?.nick;
  return nick || user?.global_name || user?.username || 'Unknown user';
}

/** People in the call, you first, then by name. Server mute and deafen win over your own, as on desktop. */
export function participantRows(input: ParticipantsInput): ParticipantRow[] {
  const rows = input.states.map((state): ParticipantRow => {
    const user = userFor(state, input);
    const flags = occupantFlags(state);
    return {
      userId: state.user_id,
      name: nameFor(state, user, input.members),
      user: user ?? { id: state.user_id, avatar: null, username: 'Unknown user', global_name: null },
      self: state.user_id === input.selfId,
      muted: flags.mute !== null,
      deafened: flags.deaf !== null,
      speaking: (input.speaking[state.user_id] ?? 0) >= SPEAKING_THRESHOLD && flags.mute === null,
    };
  });
  return rows.sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name));
}

/** The line under the channel name while a call exists. */
export function callHeadline(call: Pick<CallState, 'status' | 'error' | 'e2ee'>): string {
  switch (call.status) {
    case 'requesting':
      return 'Starting';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'connected':
      return call.e2ee ? 'Voice connected, end-to-end encrypted' : 'Voice connected';
    case 'failed':
      return call.error ?? 'The call failed';
    case 'idle':
      return '';
  }
}
