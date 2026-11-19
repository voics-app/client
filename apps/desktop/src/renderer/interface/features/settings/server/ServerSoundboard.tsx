import { Trash, Upload } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Form';
import { IconButton } from '../../../shared/ui/IconButton';
import { EmptyState, Skeleton } from '../../../shared/ui/Misc';
import { readAsDataUrl } from '../imageUpload';
import { useGuildPermissions } from '../../../shared/hooks/usePermissions';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { hasPermission } from '@discordy/core/domain/permissions';

/** Manages the guild's bounded sound assets. Playback requires a supported voice session. */
export function ServerSoundboard({ guildId }: { guildId: string }) {
  const api = getRuntime().api;
  const perms = useGuildPermissions(guildId);
  const userId = useSessionStore((state) => state.user?.id);
  const canManage = hasPermission(perms, Permission.MANAGE_GUILD_EXPRESSIONS);
  const queryClient = useQueryClient();
  const key = ['soundboard', guildId];
  const sounds = useQuery({ queryKey: key, queryFn: () => api.soundboardSounds(guildId) });
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
      const result = await attempt(async () => {
        if (file.size > 480044) throw new Error('Sound must be at most five seconds.');
        if (name.length < 2) throw new Error('Choose a file with a name of at least two letters.');
        const data = await readAsDataUrl(file);
        const encoded = data.slice(data.indexOf(',') + 1);
        await api.createSoundboardSound(guildId, { name, sound: encoded });
        return true;
      }, 'Could not upload sound');
      if (result) await refresh();
    } finally { setBusy(false); }
  };
  return (
    <div className="settings-page">
      <h1>Soundboard</h1>
      <p className="page-sub">Add up to eight sounds for your server. Use a mono, 48 kHz, 16-bit PCM WAV up to five seconds long.</p>
      <input ref={input} type="file" accept="audio/wav,.wav" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
      <Button onClick={() => input.current?.click()} disabled={busy || (sounds.data?.length ?? 0) >= 8}><Upload size={16} /> Upload sound</Button>
      {sounds.isPending ? <Skeleton height={44} radius={12} /> : sounds.isError ? <p role="alert">Could not load sounds. Try reopening settings.</p> : sounds.data.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title="No sounds yet" body="Upload a short WAV to add it to this server." /> : (
        <ul className="emoji-list">
          {sounds.data.map((sound) => <li key={sound.id}>
            <Input aria-label={`Name of ${sound.name}`} disabled={!canManage && sound.creator_id !== userId} defaultValue={sound.name} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== sound.name) void attempt(async () => { await api.updateSoundboardSound(guildId, sound.id, { name }); await refresh(); }, 'Could not rename sound'); }} />
            <IconButton label={`Delete ${sound.name}`} disabled={!canManage && sound.creator_id !== userId} tone="danger" onClick={() => void attempt(async () => { await api.deleteSoundboardSound(guildId, sound.id); await refresh(); }, 'Could not delete sound')}><Trash size={18} /></IconButton>
          </li>)}
        </ul>
      )}
    </div>
  );
}
