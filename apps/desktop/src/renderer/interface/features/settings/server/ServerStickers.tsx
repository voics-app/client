import { Trash, Upload } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Form';
import { IconButton } from '../../../shared/ui/IconButton';
import { EmptyState, Skeleton } from '../../../shared/ui/Misc';
import { readAsDataUrl } from '../imageUpload';
import { StickerImage } from '../../chat/StickerImage';

export function ServerStickers({ guildId }: { guildId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['guild-stickers', guildId];
  const query = useQuery({ queryKey, queryFn: () => getRuntime().api.guildStickers(guildId) });
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const openDialog = useUiStore((state) => state.openDialog);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const stickers = query.data ?? [];
  const upload = async (file: File) => {
    setBusy(true);
    try {
      await attempt(async () => {
        if (file.size > 512 * 1024) throw new Error('Choose a sticker no larger than 512 KB.');
        const name = (file.name.replace(/\.[^.]+$/, '').trim().slice(0, 30) || 'sticker').padEnd(2, '_');
        const raw = await readAsDataUrl(file);
        const image = file.name.toLowerCase().endsWith('.json') ? raw.replace(/^data:[^;]*/, 'data:application/json') : raw;
        await getRuntime().api.createSticker(guildId, { name, tags: name, image });
        await invalidate();
      }, 'Could not upload sticker');
    } finally { setBusy(false); }
  };
  return <div className="settings-page">
    <h1>Stickers</h1>
    <p className="page-sub">Share custom stickers in this server. {stickers.length} of 50 slots used.</p>
    <Button variant="primary" icon={<Upload size={15} />} loading={busy} disabled={query.isPending || stickers.length >= 50} onClick={() => input.current?.click()}>Upload sticker</Button>
    <input ref={input} type="file" accept="image/png,image/gif,application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
    {query.isPending ? <Skeleton height={44} radius={12} /> : query.isError ? <p role="alert">Could not load stickers. <button type="button" onClick={() => void query.refetch()}>Try again</button></p> : stickers.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title="No stickers yet" body="Upload a 320 × 320 PNG, APNG, GIF or Lottie file up to 512 KB." /> : <ul className="emoji-manage sticker-manage">
      {stickers.map((sticker) => <li key={sticker.id}>
        <StickerImage sticker={sticker} size={48} />
        <Input aria-label={`Name of ${sticker.name}`} defaultValue={sticker.name} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== sticker.name) void attempt(async () => { await getRuntime().api.updateSticker(guildId, sticker.id, { name }); await invalidate(); }, 'Could not rename sticker'); }} />
        <Input aria-label={`Related emoji for ${sticker.name}`} defaultValue={sticker.tags} onBlur={(event) => { const tags = event.target.value.trim(); if (tags !== sticker.tags) void attempt(async () => { await getRuntime().api.updateSticker(guildId, sticker.id, { tags }); await invalidate(); }, 'Could not update related emoji'); }} />
        <IconButton label={`Delete ${sticker.name}`} tone="danger" onClick={() => openDialog({ kind: 'confirm', title: `Delete ${sticker.name}?`, body: 'Existing messages will keep this sticker.', confirmLabel: 'Delete', danger: true, onConfirm: async () => { await attempt(async () => { await getRuntime().api.deleteSticker(guildId, sticker.id); await invalidate(); }, 'Could not delete sticker'); } })}><Trash size={18} /></IconButton>
      </li>)}
    </ul>}
  </div>;
}
