import { useI18n } from '../../shared/i18n';
import { ArrowSquareIn, ArrowSquareOut, ArrowsIn, Camera, Eye, EyeSlash, Layout, UserPlus, LockKey, Microphone, MicrophoneSlash, Monitor, PhoneDisconnect, Rectangle, SquaresFour, Television, VideoCamera, VideoCameraSlash } from '@phosphor-icons/react';
import { LayoutGroup, motion } from 'framer-motion';
import { useMemo } from 'react';
import { ringableRecipients } from '@discordy/core/domain/calls';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { DEFAULT_STAGE_LAYOUT, arrangeStage, gridColumns, normalizeLayout, withoutSelfPreview, type StageMode } from '@discordy/core/domain/stageLayout';
import { ringIntoCall } from '../../app/callActions';
import { Menu, useMenu } from '../../shared/ui/Menu';
import { displayName } from '../../shared/hooks/useNames';
import { leaveVoice, stopShare, toggleCamera, toggleMute } from '../../app/voiceActions';
import { Button } from '../../shared/ui/Button';
import { IconButton } from '../../shared/ui/IconButton';
import { snappy } from '../../shared/ui/motion';
import { DeviceArrow, NoiseSuppressionButton, useKeyHint } from './DeviceMenus';
import { VideoTile, streamKey, useParticipants, type Participant } from './Participants';
import { usePopOut } from './usePopOut';
import { VoiceChatToggle } from './VoiceTextChat';

interface Tile {
  key: string;
  participant: Participant;
  kind: 'camera' | 'screen' | 'avatar';
  stream: MediaStream | null;
  hasVideo: boolean;
  isSelf: boolean;
}

/** DM and group DM calls: rings recipients who are not in the call yet. */
function AddToCall({ channelId }: { channelId: string }) {
  const { t: msg } = useI18n();
  const recipients = useGuildStore((s) => s.channels[channelId]?.recipients);
  const voiceStates = useVoiceStore((s) => s.states[channelId]);
  const me = useSessionStore((s) => s.user?.id);
  const menu = useMenu();
  const candidates = useMemo(() => ringableRecipients(recipients ?? [], Object.values(voiceStates ?? {}), me ?? ''), [recipients, voiceStates, me]);
  if (!recipients || candidates.length === 0) return null;
  return (
    <>
      <Button variant="secondary" size="sm" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.openBelow}>
        <UserPlus size={16} /> {msg("settings.voicestage.add.to.call")} </Button>
      <Menu
        open={menu.open}
        x={menu.anchor?.x ?? 0}
        y={menu.anchor?.y ?? 0}
        onClose={menu.close}
        entries={[
          ...candidates.map((user) => ({ kind: 'item' as const, label: msg('voice.ring', { name: displayName(user) }), onSelect: () => ringIntoCall(channelId, [user.id]) })),
          ...(candidates.length > 1 ? [{ kind: 'separator' as const }, { kind: 'item' as const, label: msg("settings.voicestage.ring.everyone"), onSelect: () => ringIntoCall(channelId, candidates.map((u) => u.id)) }] : []),
        ]}
      />
    </>
  );
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
      tiles.push({ key: `${uid}:main`, participant: p, kind: camera ? 'camera' : 'avatar', stream: camera, hasVideo: Boolean(camera), isSelf: uid === me });
      if (screen) tiles.push({ key: streamKey({ userId: uid, kind: 'screen' }), participant: p, kind: 'screen', stream: screen, hasVideo: true, isSelf: uid === me });
    }
    return tiles;
  }, [participants, remote, localCamera, localScreen, me]);
}

const MODES: { mode: StageMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'grid', label: 'Grid layout', icon: <SquaresFour size={24} /> },
  { mode: 'focus', label: 'Focus layout', icon: <Layout size={24} /> },
  { mode: 'spotlight', label: 'Spotlight layout', icon: <Rectangle size={24} /> },
];

/** Connected-call stage: grid, focus (speaker plus filmstrip) or spotlight, per channel; can be popped out into its own window. */
export function VoiceStage({ channelId, guildId }: { channelId: string; guildId: string | null }) {
  const { t: msg, catalogText } = useI18n();
  const allTiles = useTiles(guildId, channelId);
  const hideSelf = useVoiceStore((s) => s.hideSelfPreview);
  const setHideSelf = useVoiceStore((s) => s.setHideSelfPreview);
  const tiles = useMemo(() => withoutSelfPreview(allTiles, hideSelf), [allTiles, hideSelf]);
  const focusedKey = useVoiceStore((s) => s.focusedStream);
  const focus = useVoiceStore((s) => s.focus);
  const call = useVoiceStore((s) => s.call);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfVideo = useVoiceStore((s) => s.selfVideo);
  const selfStream = useVoiceStore((s) => s.selfStream);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const saved = usePrefsStore((s) => s.stageLayouts[channelId]);
  const patchLayout = usePrefsStore((s) => s.patchStageLayout);
  const toggleSide = useUiStore((s) => s.toggleSidePanel);
  const openDialog = useUiStore((s) => s.openDialog);
  const muteKeys = useKeyHint('toggleMute');
  const cameraKeys = useKeyHint('toggleCamera');
  const shareKeys = useKeyHint('toggleScreenShare');
  const popOut = usePopOut();
  const layout = useMemo(() => normalizeLayout(saved ?? DEFAULT_STAGE_LAYOUT), [saved]);
  const { main, rest, hidden, mode } = useMemo(() => arrangeStage(tiles, layout, focusedKey), [tiles, layout, focusedKey]);
  const columns = gridColumns(rest.length);
  const pin = (key: string) => patchLayout(channelId, { pinned: layout.pinned === key ? null : key });
  const backToGrid = () => {
    focus(null);
    patchLayout(channelId, { pinned: null, mode: 'grid' });
  };
  const renderTile = (t: Tile, big: boolean) => (
    <VideoTile
      participant={t.participant}
      stream={t.stream}
      kind={t.kind}
      focused={big}
      pinned={layout.pinned === t.key}
      onPin={() => pin(t.key)}
      onFocus={t.stream ? () => (big ? backToGrid() : focus(t.key)) : undefined}
    />
  );

  const body = (
    <>
      <LayoutGroup>
        <div className={`stage-grid${main ? ' has-focus' : ''}${mode === 'spotlight' ? ' is-spotlight' : ''}`}>
          {main && (
            <motion.div layout transition={snappy} className="stage-focus">
              {renderTile(main, true)}
            </motion.div>
          )}
          {(!main || rest.length > 0) && (
            <div className={main ? 'stage-strip' : 'stage-tiles'} style={main ? undefined : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {rest.map((t) => (
                <motion.div key={t.key} layout transition={snappy} className="stage-cell">
                  {renderTile(t, false)}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </LayoutGroup>
      {layout.hideNonVideo && hidden > 0 && <p className="stage-hidden-note tnum">{msg('voice.hidden', { count: hidden })}</p>}
      <div className="stage-controls glass" role="toolbar" aria-label={msg("settings.voicestage.call.controls")}>
        <span className="split-control">
          <IconButton label={selfMute ? msg("media.unmute") : msg("media.mute")} hint={muteKeys} size="lg" active={selfMute} tone={selfMute ? 'danger' : 'default'} onClick={() => void toggleMute()}>
            {selfMute ? <MicrophoneSlash size={24} /> : <Microphone size={24} />}
          </IconButton>
          <DeviceArrow kind="input" />
        </span>
        <span className="split-control">
          <IconButton label={selfVideo ? msg("settings.voicedock.turn.off.camera") : msg("settings.voicedock.turn.on.camera")} hint={cameraKeys} size="lg" active={selfVideo} onClick={() => void toggleCamera()}>
            <Camera size={24} weight={selfVideo ? 'fill' : 'regular'} />
          </IconButton>
          <DeviceArrow kind="camera" />
        </span>
        <NoiseSuppressionButton size="lg" iconSize={24} />
        <IconButton label={selfStream ? msg("settings.voicedock.stop.sharing") : msg("settings.screenpickerdialog.share.your.screen")} hint={shareKeys} size="lg" active={selfStream} tone={selfStream ? 'accent' : 'default'} onClick={() => (selfStream ? void stopShare() : openDialog({ kind: 'screenPicker' }))}>
          <Monitor size={24} weight={selfStream ? 'fill' : 'regular'} />
        </IconButton>
        <IconButton label={msg("header.watch")} size="lg" onClick={() => toggleSide('watch')}>
          <Television size={24} />
        </IconButton>
        <span className="stage-controls-sep" aria-hidden />
        {MODES.map((m) => (
          <IconButton key={m.mode} label={catalogText(m.label)} size="lg" active={mode === m.mode} onClick={() => patchLayout(channelId, { mode: m.mode, ...(m.mode === 'grid' ? { pinned: null } : {}) })}>
            {m.icon}
          </IconButton>
        ))}
        <IconButton label={layout.hideNonVideo ? msg("settings.voicestage.show.participants.without.video") : msg("settings.voicestage.hide.participants.without.video")} size="lg" active={layout.hideNonVideo} onClick={() => patchLayout(channelId, { hideNonVideo: !layout.hideNonVideo })}>
          {layout.hideNonVideo ? <VideoCameraSlash size={24} /> : <VideoCamera size={24} />}
        </IconButton>
        <IconButton label={hideSelf ? msg("settings.voicestage.show.your.preview") : msg("settings.voicestage.hide.your.preview")} size="lg" active={hideSelf} onClick={() => setHideSelf(!hideSelf)}>
          {hideSelf ? <EyeSlash size={24} /> : <Eye size={24} />}
        </IconButton>
        {main && (
          <IconButton label={msg("settings.voicestage.back.to.grid")} size="lg" onClick={backToGrid}>
            <ArrowsIn size={24} />
          </IconButton>
        )}
        <IconButton label={popOut.container ? msg("settings.voicestage.bring.call.back") : msg("settings.voicestage.pop.out.call")} size="lg" active={Boolean(popOut.container)} onClick={popOut.container ? popOut.close : popOut.open}>
          {popOut.container ? <ArrowSquareIn size={24} /> : <ArrowSquareOut size={24} />}
        </IconButton>
        <IconButton label={msg("settings.usercontextmenu.disconnect")} size="lg" tone="danger" onClick={() => void leaveVoice()}>
          <PhoneDisconnect size={24} weight="fill" />
        </IconButton>
      </div>
    </>
  );

  return (
    <section className="voice-stage" aria-label={msg('voice.region', { name: channel?.name ?? msg('settings.profiledialog.call') })}>
      <header className="voice-stage-head">
        <div>
          <h1>{channel?.name ?? msg("settings.profiledialog.call")}</h1>
          <p className="tnum">{msg('voice.count', { count: allTiles.filter((t) => t.kind !== 'screen').length })}{call.region ? ` · ${call.region}` : ''}</p>
        </div>
        {call.e2ee ? (
          <span className="e2ee-chip is-large"><LockKey size={13} weight="fill" /> {msg("settings.voicestage.end.to.end.encrypted")}</span>
        ) : (
          call.status === 'connected' && <span className="e2ee-chip is-off">{msg("settings.voicestage.standard.transport.encryption.dtls.srtp")}</span>
        )}
        {!guildId && <AddToCall channelId={channelId} />}
        {guildId && (
          <Button variant="secondary" size="sm" onClick={() => openDialog({ kind: 'invite', guildId, channelId })}>
            <UserPlus size={16} /> {msg("settings.invitecard.invite")} </Button>
        )}
        <VoiceChatToggle channelId={channelId} />
      </header>
      {popOut.container ? (
        <>
          <div className="stage-popped" role="status">
            <ArrowSquareOut size={28} weight="light" />
            <p>{msg("settings.voicestage.the.call.is.open.in.its.own.window")}</p>
            <Button variant="ghost" onClick={popOut.close}>{msg("settings.voicestage.bring.it.back")}</Button>
          </div>
          {createPortal(<section className="voice-stage is-popout">{body}</section>, popOut.container)}
        </>
      ) : (
        body
      )}
    </section>
  );
}
