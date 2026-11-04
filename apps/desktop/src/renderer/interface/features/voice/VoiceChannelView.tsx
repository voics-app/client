import { LockKey, SpeakerHigh, Users } from '@phosphor-icons/react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { joinVoiceChannel } from '../../app/voiceActions';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/Misc';
import { VoiceStage } from './VoiceStage';
import { useParticipants } from './Participants';
import { VoiceTextChatPanel } from './VoiceTextChat';

/** A voice channel's page: a stage while connected, otherwise a lobby with who is in the room. */
export function VoiceChannelView({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const call = useVoiceStore((s) => s.call);
  const guildId = channel?.guild_id ?? null;
  const participants = useParticipants(guildId, channelId);
  const me = useSessionStore((s) => s.user?.id);
  if (!channel) return null;
  const here = call.channelId === channelId && call.status !== 'idle';

  if (here)
    return (
      <div className="voice-call-split">
        <VoiceStage channelId={channelId} guildId={guildId} />
        <VoiceTextChatPanel channelId={channelId} />
      </div>
    );
  const alone = participants.filter((p) => p.state.user_id !== me).length === 0;

  return (
    <div className="voice-call-split">
    <section className="voice-lobby" aria-label={channel.name ?? 'Voice channel'}>
      <EmptyState
        icon={<SpeakerHigh size={36} weight="light" />}
        title={channel.name ?? 'Voice channel'}
        body={
          participants.length === 0
            ? 'Nobody is here yet. Join and start the conversation.'
            : alone
              ? 'You are the only one here.'
              : `${participants.length} ${participants.length === 1 ? 'person is' : 'people are'} in this channel.`
        }
        action={
          <>
            {participants.length > 0 && (
              <p className="lobby-people"><Users size={14} /> {participants.map((p) => p.name).join(', ')}</p>
            )}
            <Button variant="primary" size="lg" trailing={<SpeakerHigh size={16} weight="fill" />} onClick={() => void joinVoiceChannel(guildId, channelId)}>
              Join voice
            </Button>
            {channel.delivery_mode !== 'standard' && <p className="lobby-note"><LockKey size={12} weight="fill" /> Voice media is end-to-end encrypted when every participant supports it.</p>}
          </>
        }
      />
    </section>
    <VoiceTextChatPanel channelId={channelId} />
    </div>
  );
}
