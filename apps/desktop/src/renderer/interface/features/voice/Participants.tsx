import { ArrowsOut, MicrophoneSlash, MonitorArrowUp, PictureInPicture, SpeakerSlash } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useVoiceStore, usersInChannel, type RemoteStream } from '@renderer/application/stores/voiceStore';
import type { VoiceState } from '@shared/contracts/rest';
import { setUserVolume } from '../../app/voiceActions';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { useMenu } from '../../shared/ui/Menu';
import { Slider } from '../../shared/ui/Form';

export interface Participant {
  state: VoiceState;
  name: string;
  avatar: string | null;
  isSelf: boolean;
}

export function useParticipants(guildId: string | null | undefined, channelId: string): Participant[] {
  const states = useVoiceStore((s) => s.states);
  const members = useGuildStore((s) => (guildId ? s.members[guildId] : undefined));
  const channel = useGuildStore((s) => s.channels[channelId]);
  const me = useSessionStore((s) => s.user);
  return useMemo(() => {
    const scope = guildId ?? channelId;
    return usersInChannel(states, scope, channelId).map<Participant>((state) => {
      const member = state.member ?? members?.[state.user_id];
      const user = member?.user ?? channel?.recipients?.find((u) => u.id === state.user_id) ?? (me?.id === state.user_id ? me : undefined);
      return { state, name: user ? displayName(user, member?.nick) : state.user_id, avatar: user?.avatar ?? null, isSelf: state.user_id === me?.id };
    });
  }, [states, members, channel, me, guildId, channelId]);
}

export function streamKey(s: Pick<RemoteStream, 'userId' | 'kind'>): string {
  return `${s.userId}:${s.kind}`;
}

function MediaElement({ stream, muted, className, onReady }: { stream: MediaStream; muted?: boolean; className?: string; onReady?: (el: HTMLVideoElement | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
    onReady?.(el);
  }, [stream, onReady]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

function VolumePopover({ x, y, name, userId, volume, onClose }: { x: number; y: number; name: string; userId: string; volume: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="volume-pop glass" style={{ left: Math.min(x, window.innerWidth - 300), top: Math.min(y, window.innerHeight - 100) }} role="dialog" aria-label={`${name} volume`}>
      <p>{name}</p>
      <Slider label={`${name} volume`} value={volume} min={0} max={2} step={0.05} onChange={(v) => setUserVolume(userId, v)} format={(v) => `${Math.round(v * 100)}%`} />
    </div>,
    document.body,
  );
}

export function VideoTile({ participant, stream, kind, focused, onFocus }: { participant: Participant; stream: MediaStream | null; kind: 'camera' | 'screen' | 'avatar'; focused?: boolean; onFocus?: () => void }) {
  const speaking = useVoiceStore((s) => s.speaking[participant.state.user_id] ?? 0);
  const volume = useVoiceStore((s) => s.userVolumes[participant.state.user_id] ?? 1);
  const menu = useMenu();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const muted = participant.state.self_mute || participant.state.mute;
  const deaf = participant.state.self_deaf || participant.state.deaf;
  const live = kind === 'screen';
  const hasVideo = Boolean(stream) && kind !== 'avatar';

  return (
    <div
      className={`tile${live ? ' is-screen' : ''}${focused ? ' is-focused' : ''}${hasVideo ? '' : ' is-avatar'}${speaking > 0.05 && kind !== 'screen' ? ' is-speaking' : ''}`}
      style={{ '--speak': speaking } as React.CSSProperties}
      onContextMenu={participant.isSelf ? undefined : menu.openAt}
    >
      {stream && hasVideo ? (
        <MediaElement stream={stream} muted className="tile-video" onReady={setVideo} />
      ) : (
        <div className="tile-avatar">
          <Avatar id={participant.state.user_id} name={participant.name} avatar={participant.avatar} size={focused ? 112 : 76} speaking={speaking} />
        </div>
      )}
      <div className="tile-label">
        <span className="tile-name">{participant.name}{live ? ' · screen' : ''}</span>
        {muted && <MicrophoneSlash size={14} weight="fill" />}
        {deaf && <SpeakerSlash size={14} weight="fill" />}
      </div>
      {live && (
        <span className="tile-live"><MonitorArrowUp size={12} weight="fill" /> LIVE</span>
      )}
      {hasVideo && (
        <div className="tile-tools">
          {onFocus && <IconButton label={focused ? 'Unfocus' : 'Focus'} size="sm" onClick={onFocus}><ArrowsOut size={16} /></IconButton>}
          {video && 'requestPictureInPicture' in video && (
            <IconButton label="Picture in picture" size="sm" onClick={() => void video.requestPictureInPicture().catch(() => undefined)}>
              <PictureInPicture size={16} />
            </IconButton>
          )}
        </div>
      )}
      {menu.open && !participant.isSelf && (
        <VolumePopover x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} name={participant.name} userId={participant.state.user_id} volume={volume} onClose={menu.close} />
      )}
    </div>
  );
}
