import type { GuildMember, User, VoiceState } from '@discordy/core/contracts/rest';
import { DEAF_LABEL, MUTE_LABEL, occupantFlags, type OccupantFlags } from '@discordy/core/domain/voiceOccupant';

export interface OccupantView {
  userId: string;
  name: string;
  user: Pick<User, 'id' | 'avatar' | 'username' | 'global_name'>;
  /** Short status words for the row: "Muted", "Server deafened", "Camera on", "Live". */
  flags: string[];
  marks: OccupantFlags;
}

const UNKNOWN = { avatar: null, global_name: null };

/** One person in a voice channel: their server name, avatar and mute, deafen, camera and stream flags. */
export function occupantView(state: VoiceState, member: GuildMember | undefined): OccupantView {
  const source = member ?? state.member;
  const user = source?.user;
  const flags = occupantFlags(state);
  const words = [flags.mute && MUTE_LABEL[flags.mute], flags.deaf && DEAF_LABEL[flags.deaf], flags.camera && 'Camera on', flags.live && 'Live'];
  return {
    userId: state.user_id,
    name: source?.nick || user?.global_name || user?.username || state.user_id,
    user: user ?? { id: state.user_id, username: state.user_id, ...UNKNOWN },
    flags: words.filter((w): w is string => typeof w === 'string'),
    marks: flags,
  };
}
