import { useI18n } from '../../shared/i18n';
import { ArrowsOut, Users, CornersIn, CornersOut, Eye, EyeSlash, MicrophoneSlash, MonitorArrowUp, PictureInPicture, PushPin, PushPinSlash, SpeakerSlash } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { STREAM_VIEWER_REPORTING } from '@discordy/core/domain/stageLayout';
import { useVoiceStore, usersInChannel, type RemoteStream } from '@discordy/core/application/stores/voiceStore';
import type { VoiceState } from '@discordy/core/contracts/rest';
import { useFullscreen } from '../../shared/hooks/useFullscreen';
import { usePanZoom } from '../../shared/hooks/usePanZoom';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
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

function MediaElement({ stream, muted, className, style, onReady }: { stream: MediaStream; muted?: boolean; className?: string; style?: React.CSSProperties; onReady?: (el: HTMLVideoElement | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
    onReady?.(el);
  }, [stream, onReady]);
  return <video ref={ref} className={className} style={style} autoPlay playsInline muted={muted} />;
}

/** On your own screen share: how many people watch it, with their names on hover. */
function ViewerBadge({ guildId, channelId }: { guildId: string | null; channelId: string }) {
  const { t: msg, number, list } = useI18n();
  const viewers = useVoiceStore((s) => s.streamViewers);
  const participants = useParticipants(guildId, channelId);
  const names = viewers.map((id) => participants.find((p) => p.state.user_id === id)?.name ?? id);
  return (
    <span className="tile-viewers tnum" title={names.length > 0 ? list(names) : msg("settings.participants.nobody.is.watching.yet")} aria-label={msg('voice.watching', { count: viewers.length })}>
      <Users size={12} weight="fill" /> {number(viewers.length)}
    </span>
  );
}

export function VideoTile({ participant, stream, kind, focused, pinned, onPin, onFocus }: { participant: Participant; stream: MediaStream | null; kind: 'camera' | 'screen' | 'avatar'; focused?: boolean; pinned?: boolean; onPin?: () => void; onFocus?: () => void }) {
  const { t: msg, number } = useI18n();
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
  // Someone else's screen share is a blurred preview until the user opts in with Watch Stream.
  const key = streamKey({ userId: participant.state.user_id, kind: 'screen' });
  const watching = useVoiceStore((s) => s.watching.includes(key));
  const previewOnly = live && hasVideo && !participant.isSelf && !watching;
  const watchStream = useVoiceStore((s) => s.watchStream);
  const stopWatching = useVoiceStore((s) => s.stopWatching);

  // Screen shares zoom and pan; the picture goes back to 1x when the tile changes size.
  const panZoom = usePanZoom(tileRef, live && hasVideo && !previewOnly);
  const resetZoom = panZoom.reset;
  useEffect(() => resetZoom(), [fullscreen.active, resetZoom]);

  // Double-click resets a zoomed share, else toggles fullscreen; never when it lands on the tile's own tools.
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasVideo || previewOnly || (e.target as HTMLElement).closest('.tile-tools, .tile-zoom')) return;
    if (panZoom.zoomed) resetZoom();
    else fullscreen.toggle();
  };

  return (
    <>
      <div
        ref={tileRef}
        className={`tile${live ? ' is-screen' : ''}${focused ? ' is-focused' : ''}${pinned ? ' is-pinned' : ''}${hasVideo ? '' : ' is-avatar'}${previewOnly ? ' is-preview' : ''}${panZoom.zoomed ? ' is-zoomed' : ''}${speaking > 0.05 && kind !== 'screen' ? ' is-speaking' : ''}`}
        style={{ '--speak': speaking } as React.CSSProperties}
        onContextMenu={menu.openAt}
        onDoubleClick={onDoubleClick}
      >
        {stream && hasVideo ? (
          <MediaElement stream={stream} muted className="tile-video" style={panZoom.style} onReady={setVideo} />
        ) : (
          <div className="tile-avatar">
            <Avatar id={participant.state.user_id} name={participant.name} avatar={participant.avatar} size={focused ? 112 : 76} speaking={speaking} />
          </div>
        )}
        {previewOnly && (
          <div className="tile-watch">
            <Button variant="primary" onClick={() => watchStream(key)}><Eye size={16} weight="fill" /> {msg("settings.participants.watch.stream")}</Button>
          </div>
        )}
        <div className="tile-label">
          <span className="tile-name">{live ? msg('voice.screenName', { name: participant.name }) : participant.name}</span>
          {muted && <MicrophoneSlash size={14} weight="fill" />}
          {deaf && <SpeakerSlash size={14} weight="fill" />}
        </div>
        {live && (
          <span className="tile-live"><MonitorArrowUp size={12} weight="fill" /> {msg("settings.channelsidebar.live")}</span>
        )}
        {panZoom.zoomed && (
          <button type="button" className="tile-zoom tnum" aria-label={msg("settings.participants.reset.zoom")} title={msg("settings.participants.reset.zoom.double.click")} onClick={resetZoom}>{number(panZoom.view.zoom, { style: 'percent', maximumFractionDigits: 0 })}</button>
        )}
        {STREAM_VIEWER_REPORTING && live && participant.isSelf && participant.state.channel_id && <ViewerBadge guildId={guildId} channelId={participant.state.channel_id} />}
        {pinned && <span className="tile-pin" title={msg("home.pinned")}><PushPin size={12} weight="fill" /></span>}
        {(hasVideo || onPin) && !previewOnly && (
          <div className="tile-tools">
            {onPin && <IconButton label={pinned ? msg("pins.unpin") : msg("menu.pin")} size="sm" onClick={onPin}>{pinned ? <PushPinSlash size={16} /> : <PushPin size={16} />}</IconButton>}
            {hasVideo && onFocus && <IconButton label={focused ? msg("settings.participants.unfocus") : msg("settings.participants.focus")} size="sm" onClick={onFocus}><ArrowsOut size={16} /></IconButton>}
            {live && !participant.isSelf && <IconButton label={msg("settings.participants.stop.watching")} size="sm" onClick={() => stopWatching(key)}><EyeSlash size={16} /></IconButton>}
            {hasVideo && <IconButton label={fullscreen.active ? msg("settings.participants.exit.full.screen") : msg("settings.participants.full.screen")} size="sm" onClick={fullscreen.toggle}>
              {fullscreen.active ? <CornersIn size={16} /> : <CornersOut size={16} />}
            </IconButton>}
            {hasVideo && video && 'requestPictureInPicture' in video && (
              <IconButton label={msg("settings.participants.picture.in.picture")} size="sm" onClick={() => void video.requestPictureInPicture().catch(() => undefined)}>
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
