import { useI18n } from '../../shared/i18n';
import { FilmSlate, Pause, Play, ShieldWarning } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { ElementPlayer } from '@renderer/application/watch/elementPlayer';
import type { WatchStatus } from '@renderer/application/watch/watchTogetherService';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Form';
import { IconButton } from '../../shared/ui/IconButton';
import { getEngines } from '../../app/engines';

/** Watch Together: everyone plays their own copy of the source, synced on the server clock. The DRM-safe alternative to sharing a streaming tab. */
export function WatchPanel({ channelId }: { channelId: string }) {
  const { t: msg, catalogText } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<WatchStatus>({ state: 'idle' });
  const [playing, setPlaying] = useState(false);
  const watch = getEngines()?.watch ?? null;

  useEffect(() => {
    const el = videoRef.current;
    if (!watch || !el) return;
    setStatus(watch.getStatus());
    const stop = watch.onStatus(setStatus);
    const detach = watch.attachPlayer(channelId, new ElementPlayer(el));
    const sync = () => setPlaying(!el.paused);
    el.addEventListener('play', sync);
    el.addEventListener('pause', sync);
    return () => {
      el.removeEventListener('play', sync);
      el.removeEventListener('pause', sync);
      stop();
      detach();
    };
  }, [watch, channelId]);

  if (!watch) {
    return <p className="panel-note">{msg("settings.watchpanel.watch.together.needs.the.desktop.app")}</p>;
  }

  const awaiting = status.state === 'awaiting_local_file' ? status : null;
  return (
    <div className="watch-panel">
      <video ref={videoRef} playsInline controls={false} />
      <div className="watch-controls">
        <IconButton label={playing ? msg("settings.watchpanel.pause.for.everyone") : msg("settings.watchpanel.play.for.everyone")} tone="accent" active={playing} disabled={status.state !== 'ready'} onClick={() => (playing ? watch.pause() : watch.play())}>
          {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
        </IconButton>
        <input
          type="range"
          className="slider"
          aria-label={msg("settings.mediaplayer.seek")}
          min={0}
          max={1000}
          defaultValue={0}
          disabled={status.state !== 'ready'}
          onChange={(e) => {
            const el = videoRef.current;
            if (el && Number.isFinite(el.duration)) watch.seek((Number(e.target.value) / 1000) * el.duration * 1000);
          }}
        />
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void watch.load(url);
        }}
      >
        <Input aria-label={msg("settings.watchpanel.media.link")} placeholder="https://example.com/video.mp4" value={url} onChange={(e) => setUrl(e.target.value)} leading={<FilmSlate size={16} />} />
        <div className="row-start">
          <Button type="submit" variant="primary" disabled={!url.trim()}>{msg("settings.watchpanel.share.link")}</Button>
          <Button onClick={() => fileRef.current?.click()}>{msg("settings.watchpanel.pick.a.local.file")}</Button>
        </div>
      </form>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const blob = URL.createObjectURL(file);
          if (awaiting && awaiting.name === file.name) void watch.provideLocalFile(file.name, blob);
          else void watch.load(`local:${file.name}`, blob);
        }}
      />
      {awaiting && <p className="watch-note" role="status">{msg('watch.awaiting', { name: awaiting.name })}</p>}
      {status.state === 'error' && <p className="field-error" role="alert"><ShieldWarning size={14} /> {catalogText(status.message)}</p>}
      {status.state === 'loading' && <p className="watch-note">{msg("settings.attachmentview.loading")}</p>}
      <p className="watch-note">{msg("settings.watchpanel.links.must.be.direct.https.media.files.drm.protected")}</p>
    </div>
  );
}
