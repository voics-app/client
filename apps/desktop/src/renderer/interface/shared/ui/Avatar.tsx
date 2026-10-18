import type { CSSProperties } from 'react';
import type { PresenceStatus } from '@shared/contracts/rest';
import { useConnectionStore } from '../../app/connectionStore';

interface Props {
  id?: string;
  name: string;
  avatar?: string | null;
  size?: number;
  status?: PresenceStatus | null;
  speaking?: number;
  bot?: boolean;
  square?: boolean;
}

function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  return (parts.length > 1 ? first[0]! + parts[parts.length - 1]![0]! : first.slice(0, 2)).toUpperCase();
}

export function assetUrl(cdn: string, kind: 'avatars' | 'icons' | 'banners', id: string, hash: string): string {
  return `${cdn}/${kind}/${id}/${hash}.png?size=128`;
}

/** Avatar with optional presence dot and the audio-driven speaking ring. */
export function Avatar({ id, name, avatar, size = 36, status, speaking = 0, bot, square }: Props) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const h = hueOf(id ?? name);
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, size * 0.38),
    '--av-h': h,
    '--speak': speaking,
    borderRadius: square ? Math.round(size * 0.3) : undefined,
  } as CSSProperties;
  const src = avatar && id ? assetUrl(cdn, 'avatars', id, avatar) : null;
  return (
    <span className={`avatar${speaking > 0 ? ' is-speaking' : ''}`} style={style}>
      <span className="avatar-face" style={square ? { borderRadius: 'inherit' } : undefined}>
        {src ? <img src={src} alt="" draggable={false} /> : <span aria-hidden="true">{initialsOf(name)}</span>}
      </span>
      {bot && <span className="avatar-bot">BOT</span>}
      {status && status !== 'invisible' && <span className={`status-dot status-${status}`} role="img" aria-label={status} />}
    </span>
  );
}
