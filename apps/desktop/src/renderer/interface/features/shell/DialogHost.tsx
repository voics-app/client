import { useState, type FormEvent } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore, type Dialog } from '@renderer/application/stores/uiStore';
import { ChannelType, type Invite } from '@shared/contracts/rest';
import { attempt, copyText, errorMessage } from '../../app/actions';
import { openChannel, openGuild } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Segmented, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { ProfileDialog } from '../members/ProfileDialog';
import { ScreenPickerDialog } from '../voice/ScreenPickerDialog';
import { setStatusText } from './customStatus';

function useClose() {
  return () => useUiStore.getState().openDialog(null);
}

function CreateGuildDialog() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useClose();
  const me = useSessionStore((s) => s.user);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const guild = await getRuntime().api.createGuild({ name: name.trim() });
      useGuildStore.getState().upsertGuild(guild);
      close();
      openGuild(guild.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={close} title="Create your server" description="A server is where you and your friends hang out. Make yours and start talking.">
      <form onSubmit={submit} className="stack">
        <Field label="Server name" error={error}>
          {(id) => <Input id={id} data-autofocus value={name} maxLength={100} placeholder={`${me ? displayName(me) : 'My'}'s server`} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="row-end">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>Create server</Button>
        </div>
      </form>
    </Modal>
  );
}

function parseInviteCode(input: string): string {
  const m = /(?:invite\/|discordy:\/\/invite\/|\/)?([\w-]{4,32})\/?$/.exec(input.trim());
  return m?.[1] ?? input.trim();
}

function JoinGuildDialog({ initial }: { initial?: string }) {
  const [code, setCode] = useState(initial ?? '');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useClose();
  const api = getRuntime().api;
  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setInvite(await api.invite(parseInviteCode(code)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    if (!invite) return;
    setBusy(true);
    const joined = await attempt(() => api.acceptInvite(invite.code), 'Could not join server');
    setBusy(false);
    if (joined) {
      close();
      const gid = joined.guild?.id ?? invite.guild?.id;
      if (gid) setTimeout(() => openGuild(gid), 300);
    }
  };
  return (
    <Modal open onClose={close} title="Join a server" description="Enter an invite link or code.">
      {invite ? (
        <div className="stack">
          <div className="invite-card">
            <Avatar id={invite.guild?.id} name={invite.guild?.name ?? '?'} avatar={invite.guild?.icon} size={56} square />
            <div>
              <h3>{invite.guild?.name}</h3>
              <p>{invite.approximate_member_count ?? '?'} members · {invite.approximate_presence_count ?? '?'} online</p>
            </div>
          </div>
          <div className="row-end">
            <Button variant="ghost" onClick={() => setInvite(null)}>Back</Button>
            <Button variant="primary" loading={busy} onClick={() => void accept()}>Accept invite</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={lookup} className="stack">
          <Field label="Invite link or code" error={error}>
            {(id) => <Input id={id} data-autofocus value={code} placeholder="https://discordy.voics.nl/invite/hTKzmak" onChange={(e) => setCode(e.target.value)} />}
          </Field>
          <div className="row-end">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={code.trim().length < 4}>Continue</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CreateChannelDialog({ guildId, parentId, type: initialType }: { guildId: string; parentId: string | null; type?: number }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<number>(initialType ?? ChannelType.GUILD_TEXT);
  const [mode, setMode] = useState<'standard' | 'ephemeral'>('standard');
  const [busy, setBusy] = useState(false);
  const close = useClose();
  const isCategory = type === ChannelType.GUILD_CATEGORY;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const clean = name.trim().toLowerCase().replace(/\s+/g, '-');
    const channel = await attempt(
      () => getRuntime().api.createChannel(guildId, { name: isCategory ? name.trim() : clean, type, parent_id: isCategory ? null : parentId, delivery_mode: type === ChannelType.GUILD_TEXT ? mode : 'standard' }),
      'Could not create channel',
    );
    setBusy(false);
    if (channel) {
      useGuildStore.getState().upsertChannel({ ...channel, guild_id: guildId });
      close();
      if (!isCategory && channel.type === ChannelType.GUILD_TEXT) useUiStore.getState().navigate({ kind: 'guild', guildId, channelId: channel.id });
    }
  };
  return (
    <Modal open onClose={close} title={isCategory ? 'Create category' : 'Create channel'}>
      <form onSubmit={submit} className="stack">
        {!initialType && (
          <Segmented
            label="Channel type"
            value={String(type)}
            onChange={(v) => setType(Number(v))}
            options={[
              { value: String(ChannelType.GUILD_TEXT), label: 'Text' },
              { value: String(ChannelType.GUILD_VOICE), label: 'Voice' },
              { value: String(ChannelType.GUILD_ANNOUNCEMENT), label: 'Announcement' },
              { value: String(ChannelType.GUILD_FORUM), label: 'Forum' },
            ]}
          />
        )}
        <Field label={isCategory ? 'Category name' : 'Channel name'}>
          {(id) => <Input id={id} data-autofocus value={name} maxLength={100} placeholder={isCategory ? 'New category' : 'new-channel'} onChange={(e) => setName(e.target.value)} />}
        </Field>
        {type === ChannelType.GUILD_TEXT && (
          <Field label="Delivery mode" hint="Ephemeral channels are end-to-end encrypted and limited to 100 members. Bots and embeds do not work there.">
            {() => (
              <Segmented label="Delivery mode" value={mode} onChange={setMode} options={[{ value: 'standard', label: 'Standard' }, { value: 'ephemeral', label: 'Ephemeral E2EE' }]} />
            )}
          </Field>
        )}
        <div className="row-end">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 1}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}

function InviteDialog({ guildId, channelId }: { guildId: string; channelId: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [maxAge, setMaxAge] = useState('86400');
  const [maxUses, setMaxUses] = useState('0');
  const [busy, setBusy] = useState(false);
  const close = useClose();
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const generate = async () => {
    setBusy(true);
    const created = await attempt(() => getRuntime().api.createInvite(channelId, { max_age: Number(maxAge), max_uses: Number(maxUses) }), 'Could not create invite');
    setBusy(false);
    if (created) setInvite(created);
  };
  const link = invite ? `https://discordy.voics.nl/invite/${invite.code}` : '';
  return (
    <Modal open onClose={close} title={`Invite people to ${guild?.name ?? 'server'}`} description="Share this link so others can join.">
      <div className="stack">
        {invite ? (
          <div className="invite-link">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="primary" onClick={() => void copyText(link, 'Invite link copied')}>Copy</Button>
          </div>
        ) : (
          <>
            <Field label="Expire after">
              {(id) => (
                <Select id={id} value={maxAge} onChange={(e) => setMaxAge(e.target.value)}>
                  <option value="1800">30 minutes</option><option value="3600">1 hour</option><option value="86400">1 day</option><option value="604800">7 days</option><option value="0">Never</option>
                </Select>
              )}
            </Field>
            <Field label="Max uses">
              {(id) => (
                <Select id={id} value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
                  <option value="0">No limit</option><option value="1">1 use</option><option value="5">5 uses</option><option value="25">25 uses</option><option value="100">100 uses</option>
                </Select>
              )}
            </Field>
            <div className="row-end"><Button variant="primary" loading={busy} onClick={() => void generate()}>Generate invite link</Button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

function NewDmDialog() {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const close = useClose();
  const guilds = useGuildStore((s) => s.members);
  const channels = useGuildStore((s) => s.channels);
  const me = useSessionStore((s) => s.user?.id);
  const people = new Map<string, { id: string; name: string; avatar: string | null }>();
  for (const members of Object.values(guilds)) for (const m of Object.values(members)) if (m.user.id !== me && !m.user.bot) people.set(m.user.id, { id: m.user.id, name: displayName(m.user, m.nick), avatar: m.user.avatar });
  for (const c of Object.values(channels)) for (const u of c.recipients ?? []) if (u.id !== me) people.set(u.id, { id: u.id, name: displayName(u), avatar: u.avatar });
  const list = [...people.values()].filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
  const create = async () => {
    setBusy(true);
    const channel = await attempt(() => getRuntime().api.openPrivateChannel(picked), 'Could not open conversation');
    setBusy(false);
    if (channel) {
      useGuildStore.getState().upsertChannel(channel);
      close();
      openChannel(channel.id);
    }
  };
  return (
    <Modal open onClose={close} title="New message" description="Pick one person for a DM or several for a group.">
      <div className="stack">
        <Input data-autofocus placeholder="Find a person" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a person" />
        <ul className="pick-list">
          {list.map((p) => (
            <li key={p.id}>
              <label className="pick-row">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))} />
                <Avatar id={p.id} name={p.name} avatar={p.avatar} size={30} />
                <span>{p.name}</span>
              </label>
            </li>
          ))}
          {list.length === 0 && <li className="pick-empty">No people found. Join a server or add friends first.</li>}
        </ul>
        <div className="row-end">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={picked.length === 0} onClick={() => void create()}>{picked.length > 1 ? 'Create group' : 'Open conversation'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CustomStatusDialog() {
  const current = useSessionStore((s) => s.settings.custom_status);
  const [text, setText] = useState(current?.text ?? '');
  const close = useClose();
  return (
    <Modal open onClose={close} title="Set a custom status" width={420}>
      <div className="stack">
        <Field label="What's happening?">{(id) => <Input id={id} data-autofocus value={text} maxLength={128} onChange={(e) => setText(e.target.value)} />}</Field>
        <div className="row-end">
          <Button variant="ghost" onClick={() => { void setStatusText(null); close(); }}>Clear</Button>
          <Button variant="primary" onClick={() => { void setStatusText(text.trim() || null); close(); }}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDialog({ dialog }: { dialog: Extract<Dialog, { kind: 'confirm' }> }) {
  const [busy, setBusy] = useState(false);
  const close = useClose();
  return (
    <Modal open onClose={close} title={dialog.title} width={400}>
      <p className="confirm-body">{dialog.body}</p>
      <div className="row-end">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button
          variant={dialog.danger ? 'danger' : 'primary'}
          loading={busy}
          data-autofocus
          onClick={async () => {
            setBusy(true);
            try {
              await dialog.onConfirm();
            } finally {
              setBusy(false);
              close();
            }
          }}
        >
          {dialog.confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function DialogHost() {
  const dialog = useUiStore((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'createGuild': return <CreateGuildDialog />;
    case 'joinGuild': return <JoinGuildDialog initial={dialog.code} />;
    case 'createChannel': return <CreateChannelDialog guildId={dialog.guildId} parentId={dialog.parentId} type={dialog.type} />;
    case 'invite': return <InviteDialog guildId={dialog.guildId} channelId={dialog.channelId} />;
    case 'newDm': return <NewDmDialog />;
    case 'screenPicker': return <ScreenPickerDialog />;
    case 'profile': return <ProfileDialog userId={dialog.userId} guildId={dialog.guildId} />;
    case 'customStatus': return <CustomStatusDialog />;
    case 'confirm': return <ConfirmDialog dialog={dialog} />;
  }
}
