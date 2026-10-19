import { ArrowsOut, CornersIn, CornersOut, MicrophoneSlash, MonitorArrowUp, PictureInPicture, SpeakerSlash } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useVoiceStore, usersInChannel, type RemoteStream } from '@renderer/application/stores/voiceStore';
import type { VoiceState } from '@shared/contracts/rest';
import { useFullscreen } from '../../shared/hooks/useFullscreen';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { useMenu } from '../../shared/ui/Menu';
import { UserContextMenu } from '../members/UserContextMenu';

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

export function VideoTile({ participant, stream, kind, focused, onFocus }: { participant: Participant; stream: MediaStream | null; kind: 'camera' | 'screen' | 'avatar'; focused?: boolean; onFocus?: () => void }) {
  const speaking = useVoiceStore((s) => s.speaking[participant.state.user_id] ?? 0);
  const channelGuildId = useGuildStore((s) => s.channels[participant.state.channel_id ?? '']?.guild_id);
  const guildId = participant.state.guild_id ?? channelGuildId ?? null;
  const menu = useMenu();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(tileRef);
  const muted = participant.state.self_mute || participant.state.mute;
  const deaf = participant.state.self_deaf || participant.state.deaf;
  const live = kind === 'screen';
  const hasVideo = Boolean(stream) && kind !== 'avatar';

  // Double-click toggles fullscreen, but not when the double-click lands on the tile's own tools.
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasVideo || (e.target as HTMLElement).closest('.tile-tools')) return;
    fullscreen.toggle();
  };

  return (
    <>
      <div
        ref={tileRef}
        className={`tile${live ? ' is-screen' : ''}${focused ? ' is-focused' : ''}${hasVideo ? '' : ' is-avatar'}${speaking > 0.05 && kind !== 'screen' ? ' is-speaking' : ''}`}
        style={{ '--speak': speaking } as React.CSSProperties}
        onContextMenu={menu.openAt}
        onDoubleClick={onDoubleClick}
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
            <IconButton label={fullscreen.active ? 'Exit full screen' : 'Full screen'} size="sm" onClick={fullscreen.toggle}>
              {fullscreen.active ? <CornersIn size={16} /> : <CornersOut size={16} />}
            </IconButton>
            {video && 'requestPictureInPicture' in video && (
              <IconButton label="Picture in picture" size="sm" onClick={() => void video.requestPictureInPicture().catch(() => undefined)}>
                <PictureInPicture size={16} />
              </IconButton>
            )}
          </div>
        )}
      </div>
      {/* Sibling of the tile so right-clicks inside the portaled menu do not bubble back into the tile. */}
      <UserContextMenu userId={participant.state.user_id} name={participant.name} guildId={guildId} menu={menu} />
    </>
  );
}
