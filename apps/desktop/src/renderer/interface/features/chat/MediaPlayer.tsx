import { CornersOut, Pause, Play, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

interface Props {
  kind: 'audio' | 'video';
  src: string;
  label: string;
  autoPlay?: boolean;
  /** The native fullscreen button of a video; off inside the lightbox, which is already full-screen and has its own close. */
  fullscreen?: boolean;
  onError?: () => void;
}

/**
 * Audio and video player with a styled control bar. Volume and mute are shared by every player and
 * remembered in the preferences, so a quiet clip stays quiet in the next message.
 */
export function MediaPlayer({ kind, src, label, autoPlay, fullscreen = true, onError }: Props) {
  const media = useRef<HTMLMediaElement | null>(null);
  const volume = usePrefsStore((s) => s.mediaVolume);
  const muted = usePrefsStore((s) => s.mediaMuted);
  const setPref = usePrefsStore((s) => s.set);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = media.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [volume, muted]);

  const toggle = () => {
    const el = media.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };
  const common = {
    ref: media as never,
    src,
    preload: 'metadata' as const,
    autoPlay,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: () => setTime(media.current?.currentTime ?? 0),
    onLoadedMetadata: () => setDuration(media.current?.duration ?? 0),
    onError,
  };

  return (
    <div className={`media-player is-${kind}`}>
      {kind === 'video' ? <video {...common} className="media-player-video" onClick={toggle} playsInline /> : <audio {...common} />}
      <div className="media-player-bar" role="group" aria-label={`Player for ${label}`}>
        <button type="button" className="media-player-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
          {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>
        <span className="media-player-time tnum">{clock(time)}</span>
        <input
          className="media-player-seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          aria-label="Seek"
          onChange={(e) => {
            const el = media.current;
            if (el) el.currentTime = Number(e.target.value);
            setTime(Number(e.target.value));
          }}
        />
        <span className="media-player-time tnum">{clock(duration)}</span>
        <button type="button" className="media-player-btn" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setPref('mediaMuted', !muted)}>
          {muted || volume === 0 ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
        </button>
        <input
          className="media-player-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label="Volume"
          onChange={(e) => {
            const next = Number(e.target.value);
            setPref('mediaVolume', next);
            setPref('mediaMuted', next === 0);
          }}
        />
        {kind === 'video' && fullscreen && (
          <button type="button" className="media-player-btn" aria-label="Fullscreen" onClick={() => void media.current?.requestFullscreen?.().catch(() => undefined)}>
            <CornersOut size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
