import { Upload } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ChannelType } from '@discordy/core/contracts/rest';
import { assetCandidates, type AssetKind } from '@discordy/core/domain/assets';
import { AFK_TIMEOUTS, NOTIFICATION_LEVELS, SystemFlag, draftFromGuild, flagEnabled, overviewPatch, withFlag, type OverviewDraft } from '@discordy/core/domain/guildOverview';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { attempt } from '../../../app/actions';
import { useConnectionStore } from '../../../app/connectionStore';
import { getRuntime } from '../../../app/runtime';
import { Avatar } from '../../../shared/ui/Avatar';
import { Button } from '../../../shared/ui/Button';
import { AssetImage } from '../../../shared/ui/AssetImage';
import { Field, Input, Select, SettingRow, Switch, TextArea } from '../../../shared/ui/Form';
import { UnsavedBar } from '../../../shared/ui/UnsavedBar';
import { readImageUpload } from '../imageUpload';

type ImageField = 'icon' | 'banner' | 'splash';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="overview-section">
      <h2>{title}</h2>
      {hint && <p className="page-sub">{hint}</p>}
      {children}
    </section>
  );
}

/** A wide banner or invite splash with change and remove controls; shows the pending upload when there is one. */
function WideImage({ label, kind, guildId, hash, pending, onPick, onClear }: { label: string; kind: AssetKind; guildId: string; hash: string | null | undefined; pending: string | null | undefined; onPick: (file: File | undefined) => void; onClear: () => void }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = pending === undefined ? hash : pending;
  return (
    <div className="wide-image">
      <button type="button" className={`wide-image-preview${shown ? '' : ' is-empty'}`} onClick={() => fileRef.current?.click()} aria-label={`${shown ? 'Change' : 'Upload'} ${label.toLowerCase()}`}>
        {pending ? <img src={pending} alt="" /> : shown ? <AssetImage candidates={assetCandidates(cdn, kind, guildId, shown, 512)} /> : null}
        <span><Upload size={18} /> {shown ? 'Change' : 'Upload'}</span>
      </button>
      {shown && <Button variant="ghost" onClick={onClear}>Remove {label.toLowerCase()}</Button>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

export function ServerOverview({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const allChannels = useGuildStore((s) => s.channels);
  const [draft, setDraft] = useState<OverviewDraft | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const iconRef = useRef<HTMLInputElement>(null);
  const regions = useQuery({ queryKey: ['voice', 'regions'], queryFn: () => getRuntime().api.voiceRegions(), staleTime: 300_000 });
  const channels = useMemo(() => Object.values(allChannels).filter((c) => c.guild_id === guildId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [allChannels, guildId]);
  if (!guild) return null;

  const current = draft ?? draftFromGuild(guild);
  const patch = overviewPatch(guild, current);
  const dirty = Object.keys(patch).length > 0;
  const change = (next: Partial<OverviewDraft>) => setDraft({ ...current, ...next });
  const textChannels = channels.filter((c) => c.type === ChannelType.GUILD_TEXT);
  const voiceChannels = channels.filter((c) => c.type === ChannelType.GUILD_VOICE || c.type === ChannelType.GUILD_STAGE_VOICE);

  const pick = async (field: ImageField, file: File | undefined) => {
    if (!file) return;
    try {
      change({ [field]: await readImageUpload(file) });
      setImageError(null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Could not read the image.');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await attempt(() => getRuntime().api.updateGuild(guildId, patch), 'Could not save server');
      if (updated) {
        useGuildStore.getState().patchGuild({ ...updated, id: guildId });
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = (title: string, description: string, bit: number) => (
    <SettingRow title={title} description={description}>
      <Switch label={title} checked={flagEnabled(current.systemFlags, bit)} disabled={!current.systemChannelId} onChange={(on) => change({ systemFlags: withFlag(current.systemFlags, bit, on) })} />
    </SettingRow>
  );

  return (
    <div className="settings-page">
      <h1>Server overview</h1>
      <p className="page-sub">Name, images, system messages, inactivity and defaults.</p>
      <div className="overview-row">
        <button type="button" className="icon-upload" onClick={() => iconRef.current?.click()} aria-label="Change server icon">
          {current.icon ? <img src={current.icon} alt="" /> : <Avatar id={guild.id} name={guild.name} avatar={guild.icon} size={96} square kind="icons" />}
          <span><Upload size={18} /> Change</span>
        </button>
        <input ref={iconRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { void pick('icon', e.target.files?.[0]); e.target.value = ''; }} />
        <div className="stack grow">
          <Field label="Server name">{(id) => <Input id={id} value={current.name} maxLength={100} onChange={(e) => change({ name: e.target.value })} />}</Field>
          <Field label="Description">{(id) => <TextArea id={id} value={current.description} maxLength={300} onChange={(e) => change({ description: e.target.value })} />}</Field>
          <Field label="Voice region" hint="Everyone in a call shares one voice node in this region.">
            {(id) => (
              <Select id={id} value={current.region} onChange={(e) => change({ region: e.target.value })}>
                <option value="">Automatic</option>
                {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.optimal ? ' (recommended)' : ''}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </div>
      {imageError && <p className="field-error" role="alert">{imageError}</p>}

      <Section title="Server banner" hint="Shown at the top of the channel list. Recommended 960x540.">
        <WideImage label="Banner" kind="banners" guildId={guildId} hash={guild.banner} pending={current.banner} onPick={(f) => void pick('banner', f)} onClear={() => change({ banner: null })} />
      </Section>
      <Section title="Invite splash" hint="The background of your invite pages.">
        <WideImage label="Splash" kind="splashes" guildId={guildId} hash={guild.splash} pending={current.splash} onPick={(f) => void pick('splash', f)} onClear={() => change({ splash: null })} />
      </Section>

      <Section title="System messages">
        <Field label="System messages channel" hint="Where welcome messages are posted.">
          {(id) => (
            <Select id={id} value={current.systemChannelId} onChange={(e) => change({ systemChannelId: e.target.value })}>
              <option value="">No system messages</option>
              {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </Select>
          )}
        </Field>
        {toggle('Send a random welcome message when someone joins', 'Posts a greeting in the system channel for every new member.', SystemFlag.SUPPRESS_JOIN_NOTIFICATIONS)}
        {toggle('Prompt members to reply to welcome messages', 'Shows a quick reply on welcome messages so members can greet newcomers.', SystemFlag.SUPPRESS_JOIN_NOTIFICATION_REPLIES)}
        {toggle('Send helpful tips for server setup', 'Occasional reminders about features to set up.', SystemFlag.SUPPRESS_GUILD_REMINDER_NOTIFICATIONS)}
      </Section>

      <Section title="Inactive channel">
        <Field label="Inactive channel" hint="Members who stay idle in voice are moved here.">
          {(id) => (
            <Select id={id} value={current.afkChannelId} onChange={(e) => change({ afkChannelId: e.target.value })}>
              <option value="">No inactive channel</option>
              {voiceChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Inactive timeout">
          {(id) => (
            <Select id={id} value={String(current.afkTimeout)} disabled={!current.afkChannelId} onChange={(e) => change({ afkTimeout: Number(e.target.value) })}>
              {AFK_TIMEOUTS.map((t) => <option key={t.seconds} value={t.seconds}>{t.label}</option>)}
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Default notification settings">
        <Field label="For new members" hint="Members can change this for themselves in their notification settings.">
          {(id) => (
            <Select id={id} value={String(current.notifications)} onChange={(e) => change({ notifications: Number(e.target.value) })}>
              {NOTIFICATION_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </Select>
          )}
        </Field>
      </Section>
      <UnsavedBar dirty={dirty} saving={saving} onReset={() => { setDraft(null); setImageError(null); }} onSave={() => void save()} />
    </div>
  );
}
