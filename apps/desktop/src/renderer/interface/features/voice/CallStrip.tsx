import { useI18n } from '../../shared/i18n';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { VideoTile } from './Participants';
import { useTiles } from './VoiceStage';

/** Compact call area shown above a DM conversation while a call is active. */
export function CallStrip({ channelId }: { channelId: string }) {
  const { t: msg } = useI18n();
  const guildId = useGuildStore((s) => s.channels[channelId]?.guild_id ?? null);
  const tiles = useTiles(guildId, channelId);
  const focus = useVoiceStore((s) => s.focus);
  return (
    <div className="call-strip" aria-label={msg("settings.callstrip.active.call")}>
      {tiles.map((t) => (
        <div key={t.key} className="call-strip-cell">
          <VideoTile participant={t.participant} stream={t.stream} kind={t.kind} onFocus={t.stream ? () => focus(t.key) : undefined} />
        </div>
      ))}
    </div>
  );
}
