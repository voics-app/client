import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { CaretRight, GameController, GraduationCap, Heart, PaintBrush, Plus, UsersThree } from '@phosphor-icons/react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { parseTemplateCode, previewTemplate, templateSummary, usageLabel } from '@discordy/core/domain/templateModel';
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
      title={template ? `Customize your ${template.name} server` : 'Customize your server'}
      description="Give your new server a name. You can always change it later."
    >
      <form onSubmit={submit} className="stack">
        <Field label="Server name" error={error}>
          {(id) => <Input id={id} data-autofocus value={name} maxLength={100} placeholder={`${me ? displayName(me) : 'My'}'s server`} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="row-end">
          <Button variant="ghost" onClick={onBack}>Back</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>Create server</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Step one of Discord's flow: "Create My Own" plus the built-in templates. */
export function CreateGuildDialog() {
  const templates = useQuery({ queryKey: ['guild-templates', 'builtin'], queryFn: () => getRuntime().api.builtinGuildTemplates(), staleTime: 300_000 });
  const [step, setStep] = useState<{ kind: 'pick' } | { kind: 'name'; template: GuildTemplate | null }>({ kind: 'pick' });
  const [link, setLink] = useState('');
  const linked = parseTemplateCode(link);
  if (step.kind === 'name') return <NameStep template={step.template} onBack={() => setStep({ kind: 'pick' })} />;
  return (
    <Modal open onClose={close} title="Create your server" description="A server is where you and your friends hang out. Start from scratch or pick a template.">
      <div className="stack">
        <ul className="template-list" aria-label="Server templates">
          <li>
            <button type="button" className="template-row" data-autofocus onClick={() => setStep({ kind: 'name', template: null })}>
              <span className="template-icon"><Plus size={22} weight="bold" /></span>
              <span className="template-text"><strong>Create My Own</strong><span>Start with an empty server.</span></span>
              <CaretRight size={16} />
            </button>
          </li>
          {templates.isPending && <li><Skeleton height={56} radius={12} /></li>}
          {templates.data?.map((t) => (
            <li key={t.code}>
              <button type="button" className="template-row" onClick={() => setStep({ kind: 'name', template: t })}>
                <span className="template-icon">{TEMPLATE_ICONS[t.code] ?? <UsersThree size={22} weight="duotone" />}</span>
                <span className="template-text"><strong>{t.name}</strong><span>{t.description ?? templateSummary(t)}</span></span>
                <CaretRight size={16} />
              </button>
            </li>
          ))}
        </ul>
        {templates.isError && <p className="setting-desc" role="status">Templates could not be loaded. You can still create your own server.</p>}
        <Field label="Have a template link?">
          {(id) => (
            <div className="invite-link">
              <Input id={id} value={link} placeholder="Paste a template link or code" onChange={(e) => setLink(e.target.value)} />
              <Button disabled={!linked} onClick={() => linked && useUiStore.getState().openDialog({ kind: 'template', code: linked })}>Preview</Button>
            </div>
          )}
        </Field>
        <div className="row-end"><Button variant="ghost" onClick={close}>Cancel</Button></div>
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
  const template = useQuery({ queryKey: ['guild-templates', 'code', code], queryFn: () => getRuntime().api.guildTemplate(code), retry: false });
  const [creating, setCreating] = useState(false);
  const data = template.data;
  if (creating && data) return <NameStep template={data} onBack={() => setCreating(false)} />;
  const preview = data ? previewTemplate(data) : null;
  return (
    <Modal open onClose={close} title={data ? `Create a server from ${data.name}` : 'Server template'} description={data?.description ?? undefined} width={480}>
      <div className="stack">
        {template.isPending && <Skeleton height={140} radius={12} />}
        {template.isError && <p className="setting-desc" role="alert">This template link is invalid or no longer exists. {errorMessage(template.error)}</p>}
        {data && preview && (
          <>
            <p className="setting-desc">
              {templateSummary(data)} · {usageLabel(data.usage_count)}
              {data.creator ? ` · by ${displayName(data.creator)}` : ''}
            </p>
            {preview.roles.length > 0 && <p className="template-roles"><strong>Roles</strong> {preview.roles.join(', ')}</p>}
            <div className="template-preview" aria-label="Channels">
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
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!data} onClick={() => setCreating(true)}>Create server</Button>
        </div>
      </div>
    </Modal>
  );
}
