import { useI18n } from '../../../shared/i18n';
import { Upload } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ChannelType } from '@discordy/core/contracts/rest';
import { assetCandidates, type AssetKind } from '@discordy/core/domain/assets';
import { AFK_TIMEOUTS, NOTIFICATION_LEVELS, SystemFlag, draftFromGuild, flagEnabled, overviewPatch, withFlag, type OverviewDraft } from '@discordy/core/domain/guildOverview';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { attempt } from '../../../app/actions';
import { useConnectionStore } from '../../../app/connectionStore';
import { getRuntime } from '../../../app/runtime';
import { Avatar } from '../../../shared/ui/Avatar';
import { Button } from '../../../shared/ui/Button';
import { AssetImage } from '../../../shared/ui/AssetImage';
import { Field, Input, Select, SettingRow, Switch, TextArea } from '../../../shared/ui/Form';
import { UnsavedBar } from '../../../shared/ui/UnsavedBar';
import { readImageUpload } from '../imageUpload';
import { ServerVanity } from './ServerVanity';

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
  const { t: msg } = useI18n();
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = pending === undefined ? hash : pending;
  return (
    <div className="wide-image">
      <button type="button" className={`wide-image-preview${shown ? '' : ' is-empty'}`} onClick={() => fileRef.current?.click()} aria-label={msg(shown ? "server.imageChange" : "server.imageUpload", { name: label })}>
        {pending ? <img src={pending} alt="" /> : shown ? <AssetImage candidates={assetCandidates(cdn, kind, guildId, shown, 512)} /> : null}
        <span><Upload size={18} /> {shown ? msg("settings.accountsecurity.change") : msg("settings.serveroverview.upload")}</span>
      </button>
      {shown && <Button variant="ghost" onClick={onClear}>{msg("server.imageRemove", { name: label })}</Button>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

export function ServerOverview({ guildId }: { guildId: string }) {
  const { t: msg, locale, catalogText } = useI18n();
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
      change({ [field]: await readImageUpload(file, locale) });
      setImageError(null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : msg("settings.serveroverview.could.not.read.the.image"));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await attempt(() => getRuntime().api.updateGuild(guildId, patch), msg("settings.serveroverview.could.not.save.server"));
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
      <h1>{msg("settings.serveroverview.server.overview")}</h1>
      <p className="page-sub">{msg("settings.serveroverview.name.images.system.messages.inactivity.and.defaults")}</p>
      <div className="overview-row">
        <button type="button" className="icon-upload" onClick={() => iconRef.current?.click()} aria-label={msg("settings.serveroverview.change.server.icon")}>
          {current.icon ? <img src={current.icon} alt="" /> : <Avatar id={guild.id} name={guild.name} avatar={guild.icon} size={96} square kind="icons" />}
          <span><Upload size={18} /> {msg("settings.accountsecurity.change")}</span>
        </button>
        <input ref={iconRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { void pick('icon', e.target.files?.[0]); e.target.value = ''; }} />
        <div className="stack grow">
          <Field label={msg("settings.serveroverview.server.name")}>{(id) => <Input id={id} value={current.name} maxLength={100} onChange={(e) => change({ name: e.target.value })} />}</Field>
          <Field label={msg("settings.serveroverview.description")}>{(id) => <TextArea id={id} value={current.description} maxLength={300} onChange={(e) => change({ description: e.target.value })} />}</Field>
          <Field label={msg("settings.serveroverview.voice.region")} hint={msg("settings.serveroverview.everyone.in.a.call.shares.one.voice.node.in")}>
            {(id) => (
              <Select id={id} value={current.region} onChange={(e) => change({ region: e.target.value })}>
                <option value="">{msg("settings.serveroverview.automatic")}</option>
                {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.optimal ? msg("settings.serveroverview.recommended") : ''}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </div>
      {imageError && <p className="field-error" role="alert">{imageError}</p>}

      <Section title={msg("settings.serveroverview.server.banner")} hint={msg("settings.serveroverview.shown.at.the.top.of.the.channel.list.recommended")}>
        <WideImage label={msg("settings.serveroverview.banner")} kind="banners" guildId={guildId} hash={guild.banner} pending={current.banner} onPick={(f) => void pick('banner', f)} onClear={() => change({ banner: null })} />
      </Section>
      <Section title={msg("settings.serveroverview.invite.splash")} hint={msg("settings.serveroverview.the.background.of.your.invite.pages")}>
        <WideImage label={msg("settings.serveroverview.splash")} kind="splashes" guildId={guildId} hash={guild.splash} pending={current.splash} onPick={(f) => void pick('splash', f)} onClear={() => change({ splash: null })} />
      </Section>

      <ServerVanity key={guildId} guildId={guildId} />

      <Section title={msg("settings.serveroverview.system.messages")}>
        <Field label={msg("settings.serveroverview.system.messages.channel")} hint={msg("settings.serveroverview.where.welcome.messages.are.posted")}>
          {(id) => (
            <Select id={id} value={current.systemChannelId} onChange={(e) => change({ systemChannelId: e.target.value })}>
              <option value="">{msg("settings.serveroverview.no.system.messages")}</option>
              {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </Select>
          )}
        </Field>
        {toggle(msg("settings.serveroverview.send.a.random.welcome.message.when.someone.joins"), msg("settings.serveroverview.posts.a.greeting.in.the.system.channel.for.every"), SystemFlag.SUPPRESS_JOIN_NOTIFICATIONS)}
        {toggle(msg("settings.serveroverview.prompt.members.to.reply.to.welcome.messages"), msg("settings.serveroverview.shows.a.quick.reply.on.welcome.messages.so.members"), SystemFlag.SUPPRESS_JOIN_NOTIFICATION_REPLIES)}
        {toggle(msg("settings.serveroverview.send.helpful.tips.for.server.setup"), msg("settings.serveroverview.occasional.reminders.about.features.to.set.up"), SystemFlag.SUPPRESS_GUILD_REMINDER_NOTIFICATIONS)}
      </Section>

      <Section title={msg("settings.serveroverview.inactive.channel")}>
        <Field label={msg("settings.serveroverview.inactive.channel")} hint={msg("settings.serveroverview.members.who.stay.idle.in.voice.are.moved.here")}>
          {(id) => (
            <Select id={id} value={current.afkChannelId} onChange={(e) => change({ afkChannelId: e.target.value })}>
              <option value="">{msg("settings.serveroverview.no.inactive.channel")}</option>
              {voiceChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={msg("settings.serveroverview.inactive.timeout")}>
          {(id) => (
            <Select id={id} value={String(current.afkTimeout)} disabled={!current.afkChannelId} onChange={(e) => change({ afkTimeout: Number(e.target.value) })}>
              {AFK_TIMEOUTS.map((t) => <option key={t.seconds} value={t.seconds}>{msg("common.minutes", { count: t.seconds / 60 })}</option>)}
            </Select>
          )}
        </Field>
      </Section>

      <Section title={msg("settings.serveroverview.safety")}>
        <SettingRow title={msg("settings.serveroverview.only.administrators.can.prune.members")} description={msg("settings.serveroverview.when.on.pruning.inactive.members.needs.the.administrator.permission")}>
          <Switch label={msg("settings.serveroverview.only.administrators.can.prune.members")} checked={current.pruneAdminOnly} onChange={(on) => change({ pruneAdminOnly: on })} />
        </SettingRow>
      </Section>

      <Section title={msg("settings.serveroverview.default.notification.settings")}>
        <Field label={msg("settings.serveroverview.for.new.members")} hint={msg("settings.serveroverview.members.can.change.this.for.themselves.in.their.notification")}>
          {(id) => (
            <Select id={id} value={String(current.notifications)} onChange={(e) => change({ notifications: Number(e.target.value) })}>
              {NOTIFICATION_LEVELS.map((l) => <option key={l.value} value={l.value}>{catalogText(l.label)}</option>)}
            </Select>
          )}
        </Field>
      </Section>
      <UnsavedBar dirty={dirty} saving={saving} onReset={() => { setDraft(null); setImageError(null); }} onSave={() => void save()} />
    </div>
  );
}
