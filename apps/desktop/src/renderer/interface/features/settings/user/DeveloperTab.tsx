import { Copy, Plus, Trash } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useReducer, useState } from 'react';
import { useInteractionStore } from '@renderer/application/stores/interactionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import {
  APPLICATION_DESCRIPTION_MAX,
  APPLICATION_NAME_MAX,
  COMMAND_NAME_MAX,
  COMMAND_TYPE_LABEL,
  commandBody,
  tokenReducer,
  validateApplicationForm,
  validateCommandForm,
  visibleToken,
  type CommandFormType,
} from '@renderer/domain/developerPortal';
import { CommandType, type ApplicationCommand, type ApplicationSummary } from '@shared/contracts/rest';
import { attempt, copyText } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Segmented, SettingRow, TextArea } from '../../../shared/ui/Form';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: String(CommandType.CHAT_INPUT), label: 'Slash command' },
  { value: String(CommandType.USER), label: 'User' },
  { value: String(CommandType.MESSAGE), label: 'Message' },
];

/** Drops cached command catalogues so a new or deleted command shows up in the composer and the Apps submenu. */
function refreshCommandCaches(): void {
  const store = useInteractionStore.getState();
  for (const scope of new Set([...Object.keys(store.commands), ...Object.keys(store.contextCommands)])) store.invalidateCommands(scope);
}

function CreateApplication({ onCreated }: { onCreated: (app: ApplicationSummary) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const errors = validateApplicationForm(name, description);
  const invalid = Boolean(errors.name || errors.description);
  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    const app = await attempt(
      () => getRuntime().api.createApplication({ name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) }),
      'Could not create application',
    );
    setBusy(false);
    if (app) {
      setName('');
      setDescription('');
      setTouched(false);
      onCreated(app);
    }
  };
  return (
    <form
      className="dev-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Application name" error={touched ? errors.name : null}>
        {(id) => <Input id={id} value={name} maxLength={APPLICATION_NAME_MAX} invalid={touched && Boolean(errors.name)} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Description (optional)" error={touched ? errors.description : null}>
        {(id) => <TextArea id={id} rows={2} maxLength={APPLICATION_DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" icon={<Plus size={14} />} loading={busy}>
        Create application
      </Button>
    </form>
  );
}

function BotToken({ app }: { app: ApplicationSummary }) {
  const openDialog = useUiStore((s) => s.openDialog);
  const [reveal, dispatch] = useReducer(tokenReducer, null);
  // The token never outlives this view or the selected application.
  useEffect(() => {
    dispatch({ kind: 'select', applicationId: app.id });
  }, [app.id]);
  const token = visibleToken(reveal, app.id);
  const reset = () =>
    openDialog({
      kind: 'confirm',
      title: 'Reset bot token?',
      body: 'The current token stops working immediately, so every running bot must be updated with the new one. The new token is shown only once.',
      confirmLabel: 'Reset token',
      danger: true,
      onConfirm: async () => {
        const result = await attempt(() => getRuntime().api.resetBotToken(app.id), 'Could not reset token');
        if (result) dispatch({ kind: 'reveal', applicationId: app.id, token: result.token });
      },
    });
  return (
    <SettingRow title="Bot token" description="Used by your bot to sign in. It cannot be shown again after you leave this page, so copy it now.">
      <div className="dev-token">
        {token ? (
          <>
            <Input readOnly value={token} aria-label="Bot token" autoComplete="off" spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
            <div className="dev-actions">
              <Button size="sm" icon={<Copy size={14} />} onClick={() => void copyText(token, 'Token copied')}>
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dispatch({ kind: 'dismiss' })}>
                Hide token
              </Button>
            </div>
          </>
        ) : (
          <Button variant="danger" onClick={reset}>
            Reset token
          </Button>
        )}
      </div>
    </SettingRow>
  );
}

function Commands({ app }: { app: ApplicationSummary }) {
  const qc = useQueryClient();
  const openDialog = useUiStore((s) => s.openDialog);
  const key = ['developer', 'commands', app.id];
  const commands = useQuery({ queryKey: key, queryFn: () => getRuntime().api.globalCommands(app.id) });
  const [type, setType] = useState<CommandFormType>(CommandType.CHAT_INPUT);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = { type, name, description };
  const errors = validateCommandForm(form);
  const invalid = Boolean(errors.name || errors.description);
  const slash = type === CommandType.CHAT_INPUT;

  const create = async () => {
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    const created = await attempt(() => getRuntime().api.createCommand(app.id, commandBody(form)), 'Could not create command');
    setBusy(false);
    if (created) {
      setName('');
      setDescription('');
      setTouched(false);
      refreshCommandCaches();
      void qc.invalidateQueries({ queryKey: key });
    }
  };
  const remove = (c: ApplicationCommand) =>
    openDialog({
      kind: 'confirm',
      title: `Delete ${c.name}?`,
      body: 'The command disappears for everyone who has the application.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await attempt(() => getRuntime().api.deleteCommand(app.id, c.id), 'Could not delete command');
        refreshCommandCaches();
        void qc.invalidateQueries({ queryKey: key });
      },
    });

  return (
    <div className="dev-commands">
      <h3>Commands</h3>
      <ul className="dev-list" aria-label="Commands">
        {(commands.data ?? []).map((c) => {
          const isSlash = c.type === undefined || c.type === CommandType.CHAT_INPUT;
          return (
            <li key={c.id}>
              <span className="dev-badge">{COMMAND_TYPE_LABEL[c.type ?? CommandType.CHAT_INPUT]}</span>
              <span className="dev-name">{isSlash ? `/${c.name}` : c.name}</span>
              {c.description && <small>{c.description}</small>}
              <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} icon={<Trash size={14} />} onClick={() => remove(c)} />
            </li>
          );
        })}
        {commands.isSuccess && commands.data.length === 0 && <li className="pick-empty">No commands yet.</li>}
        {commands.isError && <li className="pick-empty">Could not load commands.</li>}
      </ul>
      <form
        className="dev-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Segmented label="Command type" value={String(type)} options={TYPE_OPTIONS} onChange={(v) => setType(Number(v) as CommandFormType)} />
        <Field label="Name" hint={slash ? 'Lowercase letters, numbers, - or _.' : 'Shown in the Apps menu; spaces are allowed.'} error={touched ? errors.name : null}>
          {(id) => <Input id={id} value={name} maxLength={COMMAND_NAME_MAX} invalid={touched && Boolean(errors.name)} onChange={(e) => setName(e.target.value)} />}
        </Field>
        {slash && (
          <Field label="Description" error={touched ? errors.description : null}>
            {(id) => <Input id={id} value={description} maxLength={100} invalid={touched && Boolean(errors.description)} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
        )}
        <Button type="submit" variant="primary" icon={<Plus size={14} />} loading={busy}>
          Create command
        </Button>
      </form>
    </div>
  );
}

export function DeveloperTab() {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ['developer', 'applications'], queryFn: () => getRuntime().api.applications() });
  const [selected, setSelected] = useState<string | null>(null);
  const current = apps.data?.find((a) => a.id === selected) ?? null;
  return (
    <div className="settings-page">
      <h1>Developer</h1>
      <p className="page-sub">Create applications and bots, get a bot token and manage slash and context-menu commands.</p>
      <h3>Your applications</h3>
      <ul className="dev-list" aria-label="Applications">
        {(apps.data ?? []).map((a) => (
          <li key={a.id}>
            <Button size="sm" variant={a.id === selected ? 'primary' : 'ghost'} aria-pressed={a.id === selected} onClick={() => setSelected(a.id === selected ? null : a.id)}>
              {a.name}
            </Button>
            <small>{a.id}</small>
          </li>
        ))}
        {apps.isSuccess && apps.data.length === 0 && <li className="pick-empty">You have no applications yet.</li>}
        {apps.isError && <li className="pick-empty">Could not load applications.</li>}
      </ul>
      <CreateApplication
        onCreated={(app) => {
          void qc.invalidateQueries({ queryKey: ['developer', 'applications'] });
          setSelected(app.id);
        }}
      />
      {current && (
        <>
          <h2>{current.name}</h2>
          <SettingRow title="Application ID" description="Needed to invite the bot and call the API.">
            <Button size="sm" icon={<Copy size={14} />} onClick={() => void copyText(current.id, 'Application ID copied')}>
              Copy ID
            </Button>
          </SettingRow>
          <BotToken app={current} />
          <Commands app={current} />
        </>
      )}
    </div>
  );
}
