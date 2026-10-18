import { ArrowsIn, Camera, LockKey, Microphone, MicrophoneSlash, Monitor, PhoneDisconnect, Television } from '@phosphor-icons/react';
import { LayoutGroup, motion } from 'framer-motion';
import { useMemo } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { leaveVoice, stopShare, toggleCamera, toggleMute } from '../../app/voiceActions';
import { IconButton } from '../../shared/ui/IconButton';
import { snappy } from '../../shared/ui/motion';
import { VideoTile, streamKey, useParticipants, type Participant } from './Participants';

interface Tile {
  key: string;
  participant: Participant;
  kind: 'camera' | 'screen' | 'avatar';
  stream: MediaStream | null;
}

export function useTiles(guildId: string | null, channelId: string): Tile[] {
  const participants = useParticipants(guildId, channelId);
  const remote = useVoiceStore((s) => s.remoteStreams);
  const localCamera = useVoiceStore((s) => s.localCamera);
  const localScreen = useVoiceStore((s) => s.localScreen);
  const me = useSessionStore((s) => s.user?.id);
  return useMemo(() => {
    const tiles: Tile[] = [];
    for (const p of participants) {
      const uid = p.state.user_id;
      const camera = uid === me ? localCamera : (remote.find((r) => r.userId === uid && r.kind === 'camera')?.stream ?? null);
      const screen = uid === me ? localScreen : (remote.find((r) => r.userId === uid && r.kind === 'screen')?.stream ?? null);
      tiles.push({ key: `${uid}:main`, participant: p, kind: camera ? 'camera' : 'avatar', stream: camera });
      if (screen) tiles.push({ key: streamKey({ userId: uid, kind: 'screen' }), participant: p, kind: 'screen', stream: screen });
    }
    return tiles;
  }, [participants, remote, localCamera, localScreen, me]);
}

/** Connected-call stage: adaptive grid, or a focused stream with a filmstrip. Local preview is muted. */
export function VoiceStage({ channelId, guildId }: { channelId: string; guildId: string | null }) {
  const tiles = useTiles(guildId, channelId);
  const focusedKey = useVoiceStore((s) => s.focusedStream);
  const focus = useVoiceStore((s) => s.focus);
  const call = useVoiceStore((s) => s.call);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfVideo = useVoiceStore((s) => s.selfVideo);
  const selfStream = useVoiceStore((s) => s.selfStream);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const toggleSide = useUiStore((s) => s.toggleSidePanel);
  const openDialog = useUiStore((s) => s.openDialog);
  const focused = tiles.find((t) => t.key === focusedKey) ?? tiles.find((t) => t.kind === 'screen' && false);
  const others = focused ? tiles.filter((t) => t.key !== focused.key) : tiles;
  const columns = Math.min(Math.max(1, Math.ceil(Math.sqrt(others.length))), 4);

  return (
    <section className="voice-stage" aria-label={`Voice: ${channel?.name ?? 'call'}`}>
      <header className="voice-stage-head">
        <div>
          <h1>{channel?.name ?? 'Call'}</h1>
          <p className="tnum">{tiles.filter((t) => t.kind !== 'screen').length} in call{call.region ? ` · ${call.region}` : ''}</p>
        </div>
        {call.e2ee ? (
          <span className="e2ee-chip is-large"><LockKey size={13} weight="fill" /> End-to-end encrypted</span>
        ) : (
          call.status === 'connected' && <span className="e2ee-chip is-off">Standard transport encryption (DTLS-SRTP)</span>
        )}
      </header>
      <LayoutGroup>
        <div className={`stage-grid${focused ? ' has-focus' : ''}`}>
          {focused && (
            <motion.div layout transition={snappy} className="stage-focus">
              <VideoTile participant={focused.participant} stream={focused.stream} kind={focused.kind} focused onFocus={() => focus(null)} />
            </motion.div>
          )}
          <div className={focused ? 'stage-strip' : 'stage-tiles'} style={focused ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {others.map((t) => (
              <motion.div key={t.key} layout transition={snappy} className="stage-cell">
                <VideoTile participant={t.participant} stream={t.stream} kind={t.kind} onFocus={t.stream ? () => focus(t.key) : undefined} />
              </motion.div>
            ))}
          </div>
        </div>
      </LayoutGroup>
      <div className="stage-controls glass" role="toolbar" aria-label="Call controls">
        <IconButton label={selfMute ? 'Unmute' : 'Mute'} size="lg" active={selfMute} tone={selfMute ? 'danger' : 'default'} onClick={() => void toggleMute()}>
          {selfMute ? <MicrophoneSlash size={24} /> : <Microphone size={24} />}
        </IconButton>
        <IconButton label={selfVideo ? 'Turn off camera' : 'Turn on camera'} size="lg" active={selfVideo} onClick={() => void toggleCamera()}>
          <Camera size={24} weight={selfVideo ? 'fill' : 'regular'} />
        </IconButton>
        <IconButton label={selfStream ? 'Stop sharing' : 'Share your screen'} size="lg" active={selfStream} tone={selfStream ? 'accent' : 'default'} onClick={() => (selfStream ? void stopShare() : openDialog({ kind: 'screenPicker' }))}>
          <Monitor size={24} weight={selfStream ? 'fill' : 'regular'} />
        </IconButton>
        <IconButton label="Watch Together" size="lg" onClick={() => toggleSide('watch')}>
          <Television size={24} />
        </IconButton>
        {focused && (
          <IconButton label="Back to grid" size="lg" onClick={() => focus(null)}>
            <ArrowsIn size={24} />
          </IconButton>
        )}
        <IconButton label="Disconnect" size="lg" tone="danger" onClick={() => void leaveVoice()}>
          <PhoneDisconnect size={24} weight="fill" />
        </IconButton>
      </div>
    </section>
  );
}
