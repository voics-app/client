import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { VideoTile } from './Participants';
import { useTiles } from './VoiceStage';

/** Compact call area shown above a DM conversation while a call is active. */
export function CallStrip({ channelId }: { channelId: string }) {
  const guildId = useGuildStore((s) => s.channels[channelId]?.guild_id ?? null);
  const tiles = useTiles(guildId, channelId);
  const focus = useVoiceStore((s) => s.focus);
  return (
    <div className="call-strip" aria-label="Active call">
      {tiles.map((t) => (
        <div key={t.key} className="call-strip-cell">
          <VideoTile participant={t.participant} stream={t.stream} kind={t.kind} onFocus={t.stream ? () => focus(t.key) : undefined} />
        </div>
      ))}
    </div>
  );
}
