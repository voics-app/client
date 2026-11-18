import { useI18n } from '../../shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { CaretRight, GameController, GraduationCap, Heart, PaintBrush, Plus, UsersThree } from '@phosphor-icons/react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { parseTemplateCode, previewTemplate, templateIdentity, templateSummary, usageLabel } from '@discordy/core/domain/templateModel';
import { ChannelType, type GuildTemplate } from '@discordy/core/contracts/rest';
import { errorMessage } from '../../app/actions';
import { openGuild } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Button } from '../../shared/ui/Button';
import { Field, Input } from '../../shared/ui/Form';
import { Skeleton } from '../../shared/ui/Misc';
import { Modal } from '../../shared/ui/Modal';

const close = () => useUiStore.getState().openDialog(null);

const TEMPLATE_ICONS: Record<string, ReactNode> = {
  'builtin-gaming': <GameController size={22} weight="duotone" />,
  'builtin-friends': <Heart size={22} weight="duotone" />,
  'builtin-study-group': <GraduationCap size={22} weight="duotone" />,
  'builtin-community': <UsersThree size={22} weight="duotone" />,
  'builtin-creators': <PaintBrush size={22} weight="duotone" />,
};

/** Create a server with the given name: from a template when `code` is set, empty otherwise. */
function useCreateServer(code: string | null) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const api = getRuntime().api;
      const guild = code ? await api.createGuildFromTemplate(code, { name: name.trim() }) : await api.createGuild({ name: name.trim() });
      useGuildStore.getState().upsertGuild(guild);
      close();
      openGuild(guild.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, create };
}

function NameStep({ template, onBack }: { template: GuildTemplate | null; onBack: () => void }) {
  const { t: msg, locale } = useI18n();
  const me = useSessionStore((s) => s.user);
  const [name, setName] = useState('');
  const { busy, error, create } = useCreateServer(template?.code ?? null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void create(name);
  };
  return (
    <Modal
      open
      onClose={close}
      title={template ? msg("template.customize", { name: templateIdentity(template, locale).name }) : msg("settings.createguilddialog.customize.your.server")}
      description={msg("settings.createguilddialog.give.your.new.server.a.name.you.can.always")}
    >
      <form onSubmit={submit} className="stack">
        <Field label={msg("settings.serveroverview.server.name")} error={error}>
          {(id) => <Input id={id} data-autofocus value={name} maxLength={100} placeholder={me ? msg("template.serverPlaceholder", { name: displayName(me) }) : msg("template.myServer")} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="row-end">
          <Button variant="ghost" onClick={onBack}>{msg("settings.createguilddialog.back")}</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>{msg("settings.createguilddialog.create.server")}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Step one of Discord's flow: "Create My Own" plus the built-in templates. */
export function CreateGuildDialog() {
  const { t: msg, locale } = useI18n();
  const templates = useQuery({ queryKey: ['guild-templates', 'builtin'], queryFn: () => getRuntime().api.builtinGuildTemplates(), staleTime: 300_000 });
  const [step, setStep] = useState<{ kind: 'pick' } | { kind: 'name'; template: GuildTemplate | null }>({ kind: 'pick' });
  const [link, setLink] = useState('');
  const linked = parseTemplateCode(link);
  if (step.kind === 'name') return <NameStep template={step.template} onBack={() => setStep({ kind: 'pick' })} />;
  return (
    <Modal open onClose={close} title={msg("settings.createguilddialog.create.your.server")} description={msg("settings.createguilddialog.a.server.is.where.you.and.your.friends.hang")}>
      <div className="stack">
        <ul className="template-list" aria-label={msg("settings.createguilddialog.server.templates")}>
          <li>
            <button type="button" className="template-row" data-autofocus onClick={() => setStep({ kind: 'name', template: null })}>
              <span className="template-icon"><Plus size={22} weight="bold" /></span>
              <span className="template-text"><strong>{msg("settings.createguilddialog.create.my.own")}</strong><span>{msg("settings.createguilddialog.start.with.an.empty.server")}</span></span>
              <CaretRight size={16} />
            </button>
          </li>
          {templates.isPending && <li><Skeleton height={56} radius={12} /></li>}
          {templates.data?.map((t) => (
            <li key={t.code}>
              <button type="button" className="template-row" onClick={() => setStep({ kind: 'name', template: t })}>
                <span className="template-icon">{TEMPLATE_ICONS[t.code] ?? <UsersThree size={22} weight="duotone" />}</span>
                <span className="template-text"><strong>{templateIdentity(t, locale).name}</strong><span>{templateIdentity(t, locale).description ?? templateSummary(t, locale)}</span></span>
                <CaretRight size={16} />
              </button>
            </li>
          ))}
        </ul>
        {templates.isError && <p className="setting-desc" role="status">{msg("settings.createguilddialog.templates.could.not.be.loaded.you.can.still.create")}</p>}
        <Field label={msg("settings.createguilddialog.have.a.template.link")}>
          {(id) => (
            <div className="invite-link">
              <Input id={id} value={link} placeholder={msg("settings.createguilddialog.paste.a.template.link.or.code")} onChange={(e) => setLink(e.target.value)} />
              <Button disabled={!linked} onClick={() => linked && useUiStore.getState().openDialog({ kind: 'template', code: linked })}>{msg("settings.usertabs.preview")}</Button>
            </div>
          )}
        </Field>
        <div className="row-end"><Button variant="ghost" onClick={close}>{msg("common.cancel")}</Button></div>
      </div>
    </Modal>
  );
}

const CHANNEL_GLYPH: Record<number, string> = {
  [ChannelType.GUILD_TEXT]: '#',
  [ChannelType.GUILD_ANNOUNCEMENT]: '!',
  [ChannelType.GUILD_FORUM]: '#',
  [ChannelType.GUILD_VOICE]: '~',
  [ChannelType.GUILD_STAGE_VOICE]: '~',
};

/** A template link: preview of what the template creates and a Create server button. */
export function TemplateLinkDialog({ code }: { code: string }) {
  const { t: msg, locale } = useI18n();
  const template = useQuery({ queryKey: ['guild-templates', 'code', code], queryFn: () => getRuntime().api.guildTemplate(code), retry: false });
  const [creating, setCreating] = useState(false);
  const data = template.data;
  if (creating && data) return <NameStep template={data} onBack={() => setCreating(false)} />;
  const preview = data ? previewTemplate(data) : null;
  const unavailable = (template.error as { code?: number } | null)?.code === 10057;
  return (
    <Modal open onClose={close} title={data ? msg("template.createFrom", { name: templateIdentity(data, locale).name }) : msg("settings.servertemplate.server.template")} description={data ? templateIdentity(data, locale).description ?? undefined : undefined} width={480}>
      <div className="stack">
        {template.isPending && <Skeleton height={140} radius={12} />}
        {template.isError && <div><p className="setting-desc" role="alert">{unavailable ? msg("settings.createguilddialog.this.template.link.is.invalid.or.no.longer.exists") : msg("settings.createguilddialog.could.not.load.this.template")} {errorMessage(template.error)}</p>{!unavailable && <Button onClick={() => void template.refetch()}>{msg("common.retry")}</Button>}</div>}
        {data && preview && (
          <>
            <p className="setting-desc">
              {templateSummary(data, locale)} · {usageLabel(data.usage_count, locale)}
              {data.creator ? ` · ${msg("server.inviteBy", { name: displayName(data.creator) })}` : ''}
            </p>
            {preview.roles.length > 0 && <p className="template-roles"><strong>{msg("settings.profiledialog.roles")}</strong> {preview.roles.join(', ')}</p>}
            <div className="template-preview" aria-label={msg("settings.createguilddialog.channels")}>
              {preview.groups.map((g) => (
                <div key={g.category ?? 'loose'} className="template-group">
                  {g.category && <h4>{g.category}</h4>}
                  <ul>
                    {g.channels.map((c) => <li key={`${c.type}-${c.name}`}><span aria-hidden="true">{CHANNEL_GLYPH[c.type] ?? '#'}</span> {c.name}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="row-end">
          <Button variant="ghost" onClick={close}>{msg("common.cancel")}</Button>
          <Button variant="primary" disabled={!data} onClick={() => setCreating(true)}>{msg("settings.createguilddialog.create.server")}</Button>
        </div>
      </div>
    </Modal>
  );
}
