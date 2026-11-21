import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Sticker } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { StickerImage } from './StickerImage';

function StickerPicker({ guildId, onPick }: { guildId: string | null | undefined; onPick: (sticker: Sticker) => void }) {
  const builtins = useQuery({ queryKey: ['built-in-stickers'], queryFn: () => getRuntime().api.builtInStickers() });
  const query = useQuery({ queryKey: ['guild-stickers', guildId], queryFn: () => getRuntime().api.guildStickers(guildId!), enabled: Boolean(guildId) });
  const items = [...(builtins.data ?? []), ...(query.data ?? [])];
  return <div className="sticker-picker emoji-picker glass" role="dialog" aria-label="Sticker picker">
    <h3>Stickers</h3>
    {builtins.isPending || (guildId && query.isPending) ? <p>Loading stickers…</p> : builtins.isError || (guildId && query.isError) ? <p role="alert">Could not load stickers. <button type="button" onClick={() => { void builtins.refetch(); if (guildId) void query.refetch(); }}>Try again</button></p> : items.length === 0 ? <p>No stickers available.</p> : <div className="sticker-picker-grid">{items.map((sticker) => <button key={sticker.id} type="button" title={sticker.name} aria-label={`Send ${sticker.name}`} onClick={() => onPick(sticker)}><StickerImage sticker={sticker} size={72} /></button>)}</div>}
  </div>;
}

export function useStickerPopover(guildId: string | null | undefined, onPick: (sticker: Sticker) => void): { node: ReactNode; open: (el: HTMLElement) => void } {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const down = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.sticker-picker')) setAnchor(null); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setAnchor(null); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); };
  }, [anchor]);
  const open = (el: HTMLElement) => { const rect = el.getBoundingClientRect(); setAnchor({ x: Math.min(rect.right, window.innerWidth - 12), y: rect.top - 8 }); };
  const node = anchor ? createPortal(<div className="emoji-popover" style={{ left: anchor.x, top: anchor.y, transform: 'translate(-100%, -100%)' }}>
    <StickerPicker guildId={guildId} onPick={(sticker) => { setAnchor(null); onPick(sticker); }} />
  </div>, document.body) : null;
  return { node, open };
}
