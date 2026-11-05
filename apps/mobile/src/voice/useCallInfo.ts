import { useMemo } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore, usersInChannel } from '@discordy/core/application/stores/voiceStore';
import { ChannelType, type VoiceState } from '@discordy/core/contracts/rest';
import { dmTitle } from '../dms/dmModel';
import { participantRows, type ParticipantRow } from './voiceModel';

export interface CallInfo {
  title: string;
  guildId: string | null;
  isDm: boolean;
  participants: ParticipantRow[];
}

const none: VoiceState[] = [];

/** Name and participants of the voice channel or DM call `channelId`. */
export function useCallInfo(channelId: string): CallInfo {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const members = useGuildStore((s) => (channel?.guild_id ? s.members[channel.guild_id] : undefined));
  const relationships = useRelationshipStore((s) => s.byUser);
  const selfUser = useSessionStore((s) => s.user);
  const speaking = useVoiceStore((s) => s.speaking);
  const states = useVoiceStore((s) => s.states);
  const guildId = channel?.guild_id ?? null;
  const isDm = channel?.type === ChannelType.DM || channel?.type === ChannelType.GROUP_DM;
  const inChannel = useMemo(() => usersInChannel(states, guildId ?? channelId, channelId), [states, guildId, channelId]);

  const participants = useMemo(
    () =>
      participantRows({
        states: inChannel.length > 0 ? inChannel : none,
        speaking,
        selfId: selfUser?.id ?? '',
        members,
        recipients: channel?.recipients,
        selfUser,
      }),
    [inChannel, speaking, selfUser, members, channel?.recipients],
  );
  const title = !channel ? 'Voice' : isDm ? dmTitle(channel, relationships) : channel.name || 'Voice';
  return { title, guildId, isDm, participants };
}
