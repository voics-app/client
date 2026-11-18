import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { GuildMember, User } from '@discordy/core/contracts/rest';
import { BIO_MAX_LENGTH, PRONOUNS_MAX_LENGTH, profileColor } from '@discordy/core/domain/profile';
import { errorMessage } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { can, useGuildPermissions } from '../../../shared/hooks/usePermissions';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, TextArea } from '../../../shared/ui/Form';
import { UnsavedBar } from '../../../shared/ui/UnsavedBar';
import { readImageUpload } from '../imageUpload';
import { ProfilePreview } from './ProfilePreview';

type Patch = Partial<Pick<User, 'global_name' | 'avatar' | 'banner' | 'pronouns' | 'theme_colors' | 'accent_color'>> & { bio?: string; nick?: string | null };
interface Props { user: User; member?: GuildMember; guildId?: string; onMemberSaved?: (member: GuildMember) => void }

export function ProfileEditor({ user, member, guildId, onMemberSaved }: Props) {
  const client = useQueryClient();
  const permissions = useGuildPermissions(guildId);
  const [patch, setPatch] = useState<Patch>({});
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState<'avatar' | 'banner' | null>(null);
  const [imageErrors, setImageErrors] = useState<Partial<Record<'avatar' | 'banner', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const change = (next: Patch) => { setPatch((draft) => ({ ...draft, ...next })); setError(null); setSaved(false); };
  const current = { ...(member ?? user), ...patch };
  const currentUser = guildId ? user : { ...user, ...patch };
  const canRename = !guildId || can(permissions, Permission.CHANGE_NICKNAME);
  const dirty = Object.keys(patch).length > 0 || reading !== null;
  const choose = async (kind: 'avatar' | 'banner', file?: File) => {
    if (!file) return;
    setReading(kind);
    setSaved(false);
    setImageErrors((errors) => ({ ...errors, [kind]: undefined }));
    try {
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, GIF or WebP image.');
      change({ [kind]: await readImageUpload(file) });
    } catch (cause) { setImageErrors((errors) => ({ ...errors, [kind]: `${errorMessage(cause)} Choose another image.` })); }
    finally { setReading(null); }
  };
  const save = async () => {
    if (saving || reading) return;
    setSaving(true); setError(null);
    try {
      if (guildId) {
        const updated = await getRuntime().api.updateMember(guildId, user.id, patch);
        useGuildStore.getState().upsertMember(guildId, updated);
        onMemberSaved?.(updated);
      } else {
        const updated = await getRuntime().api.updateMe(patch);
        useSessionStore.getState().setUser(updated);
        client.setQueryData(['user', user.id], updated);
        void client.invalidateQueries({ queryKey: ['user-profile', user.id] });
      }
      setPatch({}); setSaved(true);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  };
  return <>
    {guildId && <p className="setting-desc">Only shown in this server. Empty fields and removed images use your global profile.</p>}
    <div className="profile-editor-layout">
      <fieldset className="profile-editor-fields" disabled={saving || reading !== null}>
        {guildId ? <Field label="Server nickname" hint={canRename ? 'Leave empty to use your global display name.' : 'This server does not allow you to change your nickname.'}>{(id) =>
          <Input id={id} disabled={!canRename} maxLength={32} value={current.nick ?? ''} placeholder={user.global_name || user.username} onChange={(e) => change({ nick: e.target.value || null })} />
        }</Field> : <>
          <Field label="Display name">{(id) => <Input id={id} value={currentUser.global_name ?? ''} maxLength={32} placeholder={user.username} onChange={(e) => change({ global_name: e.target.value || null })} />}</Field>
          <Field label="Pronouns">{(id) => <Input id={id} value={currentUser.pronouns ?? ''} maxLength={PRONOUNS_MAX_LENGTH * 2} placeholder="e.g. they/them" onChange={(e) => change({ pronouns: Array.from(e.target.value).slice(0, PRONOUNS_MAX_LENGTH).join('') || null })} />}</Field>
        </>}
        <Field label="About me" hint={`${Array.from(current.bio ?? '').length}/${BIO_MAX_LENGTH} characters`}>{(id) => <TextArea id={id} rows={4} value={current.bio ?? ''} maxLength={BIO_MAX_LENGTH * 2} placeholder={guildId ? user.bio || 'Your global About me' : 'A little about you'} onChange={(e) => change({ bio: Array.from(e.target.value).slice(0, BIO_MAX_LENGTH).join('') })} />}</Field>
        <div className="profile-image-controls">
          {(['avatar', 'banner'] as const).map((kind) => <div className="stack" key={kind}>
            <Field label={kind === 'avatar' ? 'Avatar image' : 'Banner image'} error={imageErrors[kind]} hint={reading === kind ? <span role="status">Reading image…</span> : 'PNG, JPEG, GIF or WebP · up to 10 MB'}>{(id) => <input id={id} className="profile-file-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => { void choose(kind, e.target.files?.[0]); e.target.value = ''; }} />}</Field>
            <Button size="sm" variant="ghost" disabled={!current[kind]} onClick={() => { change({ [kind]: null }); setImageErrors((errors) => ({ ...errors, [kind]: undefined })); }}>{guildId ? `Use global ${kind}` : `Remove ${kind}`}</Button>
          </div>)}
        </div>
        {!guildId && <>
          <div className="profile-color-controls">
            {([0, 1] as const).map((index) => <Field key={index} label={index === 0 ? 'Primary theme colour' : 'Secondary theme colour'}>{(id) => <input id={id} type="color" className="color-input" value={profileColor(currentUser.theme_colors?.[index]) ?? (index === 0 ? '#7c6cf0' : '#3b436d')} onChange={(e) => {
              const colors: [number, number] = [...(currentUser.theme_colors ?? [0x7c6cf0, 0x3b436d])];
              colors[index] = Number.parseInt(e.target.value.slice(1), 16); change({ theme_colors: colors });
            }} />}</Field>)}
          </div>
          <Button size="sm" variant="ghost" disabled={!currentUser.theme_colors} onClick={() => change({ theme_colors: null })}>Reset theme colours</Button>
          <Field label="Banner fallback colour" hint="Shown when you have no banner or theme colours.">{(id) => <input id={id} type="color" className="color-input" value={profileColor(currentUser.accent_color) ?? '#7c6cf0'} onChange={(e) => change({ accent_color: Number.parseInt(e.target.value.slice(1), 16) })} />}</Field>
          <Button size="sm" variant="ghost" disabled={currentUser.accent_color == null} onClick={() => change({ accent_color: null })}>Reset fallback colour</Button>
        </>}
      </fieldset>
      <ProfilePreview user={currentUser} member={member ? { ...member, ...patch } : undefined} guildId={guildId} avatarUpload={patch.avatar ?? undefined} bannerUpload={patch.banner ?? undefined} />
    </div>
    {saved && <p className="save-bar glass" role="status">Profile saved.</p>}
    <UnsavedBar dirty={dirty} saving={saving || reading !== null} error={error} onReset={() => { setPatch({}); setError(null); setImageErrors({}); setSaved(false); }} onSave={() => void save()} />
  </>;
}
