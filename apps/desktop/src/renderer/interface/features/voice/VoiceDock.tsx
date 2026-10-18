import { LockKey, Monitor, MonitorArrowUp, PhoneDisconnect, VideoCamera, VideoCameraSlash, WifiHigh } from '@phosphor-icons/react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { stopShare, toggleCamera, leaveVoice } from '../../app/voiceActions';
import { IconButton } from '../../shared/ui/IconButton';
import { Tooltip } from '../../shared/ui/Tooltip';
import { Spinner } from '../../shared/ui/Spinner';

const STATUS_LABEL = { idle: '', requesting: 'Requesting', connecting: 'Connecting', connected: 'Voice connected', reconnecting: 'Reconnecting', failed: 'Connection failed' } as const;

function qualityTone(rtt: number, loss: number): 'good' | 'fair' | 'poor' {
  if (rtt > 250 || loss > 8) return 'poor';
  if (rtt > 120 || loss > 3) return 'fair';
  return 'good';
}

/** Floating glass dock shown while in a call: state, honest E2EE status, quality and quick controls. */
export function VoiceDock() {
  const call = useVoiceStore((s) => s.call);
  const selfVideo = useVoiceStore((s) => s.selfVideo);
  const selfStream = useVoiceStore((s) => s.selfStream);
  const channel = useGuildStore((s) => (call.channelId ? s.channels[call.channelId] : undefined));
  const guild = useGuildStore((s) => (call.guildId ? s.guilds[call.guildId] : undefined));
  const openDialog = useUiStore((s) => s.openDialog);
  const navigate = useUiStore((s) => s.navigate);
  if (call.status === 'idle') return null;
  const connected = call.status === 'connected';
  const tone = call.quality ? qualityTone(call.quality.rttMs, call.quality.lossPct) : 'good';

  return (
    <div className={`voice-dock glass is-${call.status}`} role="region" aria-label="Voice connection">
      <div className="voice-dock-top">
        <button
          type="button"
          className="voice-dock-id"
          onClick={() => channel && navigate(call.guildId ? { kind: 'guild', guildId: call.guildId, channelId: channel.id } : { kind: 'home', channelId: channel.id })}
        >
          <span className={`voice-state state-${call.status}`}>
            {connected ? <WifiHigh size={16} weight="bold" className={`quality-${tone}`} /> : <Spinner size={14} />}
            <span>{STATUS_LABEL[call.status]}</span>
          </span>
          <span className="voice-dock-place">
            {channel?.name ?? 'Call'}
            {guild ? ` · ${guild.name}` : ''}
          </span>
        </button>
        {call.e2ee && (
          <Tooltip label="Media is end-to-end encrypted (MLS keys installed)" side="top">
            <span className="e2ee-chip" tabIndex={0}>
              <LockKey size={12} weight="fill" /> E2EE
            </span>
          </Tooltip>
        )}
      </div>
      {call.error && <p className="voice-dock-error">{call.error}</p>}
      {connected && call.quality && (
        <p className="voice-dock-stats tnum">
          {Math.round(call.quality.rttMs)} ms · {call.quality.lossPct.toFixed(1)}% loss{call.region ? ` · ${call.region}` : ''}
        </p>
      )}
      <div className="voice-dock-actions">
        <IconButton label={selfVideo ? 'Turn off camera' : 'Turn on camera'} active={selfVideo} onClick={() => void toggleCamera()} disabled={!connected}>
          {selfVideo ? <VideoCamera size={20} weight="fill" /> : <VideoCameraSlash size={20} />}
        </IconButton>
        <IconButton
          label={selfStream ? 'Stop sharing' : 'Share your screen'}
          active={selfStream}
          tone={selfStream ? 'accent' : 'default'}
          onClick={() => (selfStream ? void stopShare() : openDialog({ kind: 'screenPicker' }))}
          disabled={!connected}
        >
          {selfStream ? <MonitorArrowUp size={20} weight="fill" /> : <Monitor size={20} />}
        </IconButton>
        <IconButton label="Disconnect" tone="danger" onClick={() => void leaveVoice()}>
          <PhoneDisconnect size={20} weight="fill" />
        </IconButton>
      </div>
    </div>
  );
}
