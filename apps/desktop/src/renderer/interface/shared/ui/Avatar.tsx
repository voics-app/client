import type { CSSProperties } from 'react';
import type { PresenceStatus } from '@discordy/core/contracts/rest';
import { assetCandidates, type AssetKind } from '@discordy/core/domain/assets';
import { useConnectionStore } from '../../app/connectionStore';
import { AssetImage } from './AssetImage';

interface Props {
  id?: string;
  name: string;
  avatar?: string | null;
  size?: number;
  status?: PresenceStatus | null;
  speaking?: number;
  bot?: boolean;
  square?: boolean;
  /** CDN folder of `avatar`: user avatars by default, `icons` for guilds, `app-icons` for applications. */
  kind?: AssetKind;
}

function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function initialsOf(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  return (parts.length > 1 ? first[0]! + parts[parts.length - 1]![0]! : first.slice(0, 2)).toUpperCase();
}

/** Avatar with optional presence dot and the audio-driven speaking ring. */
export function Avatar({ id, name, avatar, size = 36, status, speaking = 0, bot, square, kind = 'avatars' }: Props) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const h = hueOf(id ?? name ?? '');
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, size * 0.38),
    '--av-h': h,
    '--speak': speaking,
    borderRadius: square ? Math.round(size * 0.3) : undefined,
  } as CSSProperties;
  const candidates = avatar && id ? assetCandidates(cdn, kind, id, avatar) : null;
  return (
    <span className={`avatar${speaking > 0 ? ' is-speaking' : ''}`} style={style}>
      <span className="avatar-face" style={square ? { borderRadius: 'inherit' } : undefined}>
        {candidates ? <AssetImage candidates={candidates} /> : <span aria-hidden="true">{initialsOf(name)}</span>}
      </span>
      {bot && <span className="avatar-bot">BOT</span>}
      {status && status !== 'invisible' && <span className={`status-dot status-${status}`} role="img" aria-label={status} />}
    </span>
  );
}
