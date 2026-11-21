import { Upload } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { BIO_MAX_LENGTH } from '@discordy/core/domain/profile';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { displayName } from '../../../shared/hooks/useNames';
import { Avatar } from '../../../shared/ui/Avatar';
import { Field, Input, TextArea } from '../../../shared/ui/Form';
import { UnsavedBar } from '../../../shared/ui/UnsavedBar';
import { readImageUpload } from '../imageUpload';

const MAX_NICKNAME = 32;

/** Your own nickname, avatar, banner and About me for this server only; empty or reset falls back to the account profile. */
export function ServerProfile({ guildId }: { guildId: string }) {
  const me = useSessionStore((s) => s.user);
  const member = useGuildStore((s) => (me ? s.members[guildId]?.[me.id] : undefined));
  const saved = { nick: member?.nick ?? '', bio: member?.bio ?? '' };
  const [nick, setNick] = useState(saved.nick);
  const [bio, setBio] = useState(saved.bio);
  // undefined keeps the image, a data URI replaces it, null restores the account image.
  const [avatar, setAvatar] = useState<string | null | undefined>();
  const [banner, setBanner] = useState<string | null | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  if (!me) return null;
  const dirty = nick !== saved.nick || bio !== saved.bio || avatar !== undefined || banner !== undefined;
  const reset = () => {
    setNick(saved.nick);
    setBio(saved.bio);
    setAvatar(undefined);
    setBanner(undefined);
    setError(null);
  };
  const choose = async (file: File | undefined, set: (value: string) => void) => {
    if (!file) return;
    try {
      set(await readImageUpload(file));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the image.');
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const updated = await attempt(
        () => getRuntime().api.updateMember(guildId, me.id, {
          nick: nick.trim() || null,
          bio: bio.trim() || null,
          ...(avatar !== undefined ? { avatar } : {}),
          ...(banner !== undefined ? { banner } : {}),
        }),
        'Could not save server profile',
      );
      if (updated) {
        useGuildStore.getState().upsertMember(guildId, updated);
        setNick(updated.nick ?? '');
        setBio(updated.bio ?? '');
        setAvatar(undefined);
        setBanner(undefined);
      }
    } finally {
      setSaving(false);
    }
  };
  const hasServerAvatar = avatar ? true : avatar === undefined && !!member?.avatar;
  const hasServerBanner = banner ? true : banner === undefined && !!member?.banner;
  return (
    <div className="settings-page">
      <h1>Server profile</h1>
      <p className="page-sub">How you appear in this server only. Anything left empty uses your account profile.</p>
      <div className="overview-row">
        <button type="button" className="icon-upload is-round" onClick={() => avatarRef.current?.click()} aria-label="Change server avatar">
          {avatar ? <img src={avatar} alt="" /> : <Avatar id={me.id} name={displayName(me, nick || null)} avatar={avatar === null ? me.avatar : (member?.avatar ?? me.avatar)} size={96} />}
          <span><Upload size={18} /> Change</span>
        </button>
        <input ref={avatarRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void choose(e.target.files?.[0], setAvatar)} />
        <div className="stack grow">
          <Field label="Server nickname" hint="Leave empty to use your account name.">{(id) => <Input id={id} value={nick} maxLength={MAX_NICKNAME} placeholder={me.global_name ?? me.username} onChange={(e) => setNick(e.target.value)} />}</Field>
          <Field label="About me">{(id) => <TextArea id={id} value={bio} maxLength={BIO_MAX_LENGTH} onChange={(e) => setBio(e.target.value)} />}</Field>
        </div>
      </div>
      <div className="row-end">
        {hasServerAvatar && <button type="button" className="link-button" onClick={() => setAvatar(null)}>Remove server avatar</button>}
        <button type="button" className="link-button" onClick={() => bannerRef.current?.click()}>{hasServerBanner ? 'Change server banner' : 'Add server banner'}</button>
        {hasServerBanner && <button type="button" className="link-button" onClick={() => setBanner(null)}>Remove server banner</button>}
        <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void choose(e.target.files?.[0], setBanner)} />
      </div>
      {banner && <img src={banner} alt="New server banner preview" style={{ maxWidth: '100%', borderRadius: 8 }} />}
      {error && <p className="field-error" role="alert">{error}</p>}
      <UnsavedBar dirty={dirty} saving={saving} onReset={reset} onSave={() => void save()} />
    </div>
  );
}
