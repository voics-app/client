import { LockKey, Monitor, MonitorArrowUp, PhoneDisconnect, VideoCamera, VideoCameraSlash, WifiHigh } from '@phosphor-icons/react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { stopShare, toggleCamera, leaveVoice } from '../../app/voiceActions';
import { IconButton } from '../../shared/ui/IconButton';
import { Tooltip } from '../../shared/ui/Tooltip';
import { Spinner } from '../../shared/ui/Spinner';

import { useState } from 'react';
import { connectionRows, qualityTone } from '@renderer/domain/voicePanel';
import { Menu } from '../../shared/ui/Menu';
import { DeviceArrow, NoiseSuppressionButton, useKeyHint } from './DeviceMenus';

const STATUS_LABEL = { idle: '', requesting: 'Requesting', connecting: 'Connecting', connected: 'Voice connected', reconnecting: 'Reconnecting', failed: 'Connection failed' } as const;

/** Floating glass dock shown while in a call: state, honest E2EE status, quality and quick controls. */
export function VoiceDock() {
  const call = useVoiceStore((s) => s.call);
  const selfVideo = useVoiceStore((s) => s.selfVideo);
  const selfStream = useVoiceStore((s) => s.selfStream);
  const channel = useGuildStore((s) => (call.channelId ? s.channels[call.channelId] : undefined));
  const guild = useGuildStore((s) => (call.guildId ? s.guilds[call.guildId] : undefined));
  const cameraKeys = useKeyHint('toggleCamera');
  const shareKeys = useKeyHint('toggleScreenShare');
  const [details, setDetails] = useState<{ x: number; y: number } | null>(null);
  const openDialog = useUiStore((s) => s.openDialog);
  const navigate = useUiStore((s) => s.navigate);
  if (call.status === 'idle') return null;
  const connected = call.status === 'connected';
  const tone = call.quality ? qualityTone(call.quality.rttMs, call.quality.lossPct) : 'good';

  return (
    <div className={`voice-dock glass is-${call.status}`} role="region" aria-label="Voice connection">
      <div className="voice-dock-top">
        {connected && (
          <IconButton
            label="Connection details"
            size="sm"
            className="voice-signal"
            aria-haspopup="dialog"
            aria-expanded={details !== null}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setDetails(details ? null : { x: r.left, y: r.top - 300 });
            }}
          >
            <WifiHigh size={18} weight="bold" className={`quality-${tone}`} />
          </IconButton>
        )}
        <button
          type="button"
          className="voice-dock-id"
          onClick={() => channel && navigate(call.guildId ? { kind: 'guild', guildId: call.guildId, channelId: channel.id } : { kind: 'home', channelId: channel.id })}
        >
          <span className={`voice-state state-${call.status}`}>
            {!connected && <Spinner size={14} />}
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
      <Menu
        open={details !== null}
        x={details?.x ?? 0}
        y={details?.y ?? 0}
        minWidth={248}
        onClose={() => setDetails(null)}
        entries={[
          { kind: 'label', label: 'Connection details' },
          {
            kind: 'content',
            node: (
              <dl className="conn-details tnum">
                {connectionRows({ quality: call.quality, history: call.rttHistory, region: call.region, e2ee: call.e2ee }).map((r) => (
                  <div key={r.label} className="conn-row">
                    <dt>{r.label}</dt>
                    <dd className={r.tone ? `quality-${r.tone}` : undefined}>{r.value}</dd>
                  </div>
                ))}
              </dl>
            ),
          },
        ]}
      />
      <div className="voice-dock-actions">
        <NoiseSuppressionButton />
        <span className="split-control">
          <IconButton label={selfVideo ? 'Turn off camera' : 'Turn on camera'} hint={cameraKeys} active={selfVideo} onClick={() => void toggleCamera()} disabled={!connected}>
            {selfVideo ? <VideoCamera size={20} weight="fill" /> : <VideoCameraSlash size={20} />}
          </IconButton>
          <DeviceArrow kind="camera" />
        </span>
        <IconButton
          label={selfStream ? 'Stop sharing' : 'Share your screen'}
          hint={shareKeys}
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
