import { ChannelNotificationDialog, GuildNotificationDialog } from '../notifications/NotificationDialogs';
import { MentionsInbox } from '../notifications/MentionsInbox';
import { BotAuthorizeDialog } from '../integrations/BotAuthorizeDialog';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dmCandidates } from '@discordy/core/application/dmCandidates';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore, type Dialog } from '@discordy/core/application/stores/uiStore';
import { inviteWebUrl, parseInviteCode } from '@discordy/core/domain/inviteLinks';
import { ChannelType, type Invite } from '@discordy/core/contracts/rest';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { attempt, copyText, errorMessage } from '../../app/actions';
import { openChannel, openGuild } from '../../app/navigation';
import { useConnectionStore } from '../../app/connectionStore';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Smiley } from '@phosphor-icons/react';
import { CUSTOM_STATUS_MAX, EXPIRY_CHOICES, expiryFor, statusCharsLeft, type ExpiryChoice } from '@discordy/core/domain/selfPresence';
import { useEmojiPopover } from '../chat/EmojiPopover';
import { IconButton } from '../../shared/ui/IconButton';
import { Field, Input, Segmented, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { InteractionModal } from '../chat/InteractionModal';
import { ReportDialog } from '../report/ReportDialog';
import { ForwardDialog } from '../chat/ForwardDialog';
import { ReactionUsersDialog } from '../chat/ReactionUsersDialog';
import { BanDialog } from '../members/BanDialog';
import { ModViewDialog } from '../members/ModViewDialog';
import { PruneDialog } from '../members/PruneDialog';
import { FolderSettingsDialog } from './FolderSettingsDialog';
import { CreateGuildDialog, TemplateLinkDialog } from './CreateGuildDialog';
import { EditNicknameDialog } from '../members/EditNicknameDialog';
import { ProfileDialog } from '../members/ProfileDialog';
import { GroupDmDialog } from '../home/GroupDmDialog';
import { ScreenPickerDialog } from '../voice/ScreenPickerDialog';
import { setStatusText, type StatusEmoji } from './customStatus';
import { BRAND } from '@shared/brand';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { ACTION_LABELS, FIXED_SHORTCUTS } from '@discordy/core/domain/shortcutCatalog';

function useClose() {
  return () => useUiStore.getState().openDialog(null);
}

function JoinGuildDialog({ initial }: { initial?: string }) {
  const [code, setCode] = useState(initial ?? '');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [appealQuestion, setAppealQuestion] = useState<string | null>(null);
  const [appealAnswer, setAppealAnswer] = useState('');
  const [appealSent, setAppealSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useClose();
  const api = getRuntime().api;
  const lookupCode = async (raw: string) => {
    setBusy(true);
    setError(null);
    try {
      const found = await api.invite(parseInviteCode(raw));
      const gid = found.guild?.id;
      if (gid && useGuildStore.getState().guilds[gid]) {
        // Already a member: no accept step, just go there.
        close();
        openGuild(gid);
        useUiStore.getState().toast({ tone: 'info', title: `You are already in ${found.guild?.name ?? 'this server'}` });
        return;
      }
      setInvite(found);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      // A link opened from outside the form has nowhere to show the field error.
      if (initial) useUiStore.getState().toast({ tone: 'danger', title: 'Invite is invalid or has expired', body: message });
    } finally {
      setBusy(false);
    }
  };
  const lookup = (e: FormEvent) => {
    e.preventDefault();
    void lookupCode(code);
  };
  const autoLooked = useRef(false);
  useEffect(() => {
    // StrictMode runs effects twice in dev; look the invite up once.
    if (!initial || autoLooked.current) return;
    autoLooked.current = true;
    void lookupCode(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const accept = async () => {
    if (!invite) return;
    setBusy(true);
    try {
      const joined = await api.acceptInvite(invite.code);
      close();
      const gid = joined.guild?.id ?? invite.guild?.id;
      if (gid) setTimeout(() => openGuild(gid), 300);
    } catch (err) {
      if (err instanceof ApiError && err.code === 40007 && invite.guild?.id) {
        try { setAppealQuestion((await api.appealForm(invite.guild.id)).question); }
        catch (formError) { if (formError instanceof ApiError && formError.status === 404) setAppealQuestion(''); else setError(errorMessage(formError)); }
      } else setError(errorMessage(err));
    } finally { setBusy(false); }
  };
  const submitAppeal = async () => {
    if (!invite?.guild?.id) return;
    setBusy(true); setError(null);
    try { await api.submitBanAppeal(invite.guild.id, appealAnswer); setAppealSent(true); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={close} title="Join a server" description="Enter an invite link or code.">
      {appealQuestion !== null ? (
        <div className="stack"><h2>You are banned</h2>
          {appealSent ? <p>Your appeal has been submitted.</p> : appealQuestion ? <>
            <Field label={appealQuestion} error={error}>{(id) => <Input id={id} value={appealAnswer} maxLength={2000} onChange={(e) => setAppealAnswer(e.target.value)} />}</Field>
            <Button loading={busy} disabled={!appealAnswer.trim()} onClick={() => void submitAppeal()}>Submit appeal</Button>
          </> : <p>This server has not enabled appeals.</p>}
          <Button variant="ghost" onClick={close}>Close</Button>
        </div>
      ) : invite ? (
        <div className="stack">
          <div className="invite-card">
            <Avatar id={invite.guild?.id} name={invite.guild?.name ?? '?'} avatar={invite.guild?.icon} size={56} square kind="icons" />
            <div>
              <h3>{invite.guild?.name}</h3>
              <p>{invite.approximate_member_count ?? '?'} members · {invite.approximate_presence_count ?? '?'} online</p>
            </div>
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="row-end">
            <Button variant="ghost" onClick={() => setInvite(null)}>Back</Button>
            <Button variant="primary" loading={busy} onClick={() => void accept()}>Accept invite</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={lookup} className="stack">
          <Field label="Invite link or code" error={error}>
            {(id) => <Input id={id} data-autofocus value={code} placeholder={`${BRAND.landingUrl}/invite/hTKzmak`} onChange={(e) => setCode(e.target.value)} />}
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
  const apiUrl = useConnectionStore((c) => c.apiUrl);
  const link = invite ? inviteWebUrl(invite.code, apiUrl) : '';
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

function NewDmDialog({ preselect }: { preselect?: string[] }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>(preselect ?? []);
  const [busy, setBusy] = useState(false);
  const close = useClose();
  const members = useGuildStore((s) => s.members);
  const channels = useGuildStore((s) => s.channels);
  const relationships = useRelationshipStore((s) => s.byUser);
  const me = useSessionStore((s) => s.user?.id);
  const list = dmCandidates({ meId: me, members, channels, relationships, displayName })
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);
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
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const [emoji, setEmoji] = useState<StatusEmoji | null>(current?.emoji_name ? { name: current.emoji_name, id: current.emoji_id } : null);
  const [expiry, setExpiry] = useState<ExpiryChoice>('never');
  const picker = useEmojiPopover(null, (e) => setEmoji({ name: e.emoji.name ?? e.api, id: e.emoji.id }));
  const close = useClose();
  const left = statusCharsLeft(text);
  return (
    <Modal open onClose={close} title="Set a custom status" width={420}>
      <div className="stack">
        <Field label="What's happening?" hint={<span className="status-counter" aria-live="polite">{left} characters left</span>}>
          {(id) => (
            <div className="status-field">
              <IconButton label={emoji ? 'Change emoji' : 'Add emoji'} onClick={(e) => picker.open(e.currentTarget, false)}>
                {emoji?.id ? <img className="status-emoji" src={`${cdn}/emojis/${emoji.id}.png`} alt={emoji.name} /> : emoji ? <span>{emoji.name}</span> : <Smiley size={20} />}
              </IconButton>
              <Input id={id} data-autofocus value={text} maxLength={CUSTOM_STATUS_MAX} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
        </Field>
        {emoji && <Button variant="ghost" onClick={() => setEmoji(null)}>Remove emoji</Button>}
        <Field label="Clear after">{(id) => <Select id={id} value={expiry} onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}>{EXPIRY_CHOICES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
        <div className="row-end">
          <Button variant="ghost" onClick={() => { void setStatusText(null); close(); }}>Clear</Button>
          <Button variant="primary" onClick={() => { void setStatusText(text.trim() || null, expiryFor(expiry, new Date()), emoji); close(); }}>Save</Button>
        </div>
      </div>
      {picker.node}
    </Modal>
  );
}

function ShortcutsDialog() {
  const close = useClose();
  const keybinds = usePrefsStore((s) => s.keybinds);
  const pttLabel = usePrefsStore((s) => s.pttLabel);
  const bound = keybinds.filter((k) => k.keys).map((k) => ({ keys: k.keys, label: ACTION_LABELS[k.action] ?? k.action, global: Boolean(k.global) }));
  const rows = [...bound, ...(pttLabel ? [{ keys: pttLabel, label: 'Push to talk', global: true }] : []), ...FIXED_SHORTCUTS.map((f) => ({ keys: f.keys, label: f.label, global: false }))];
  return (
    <Modal open onClose={close} title="Keyboard shortcuts" description="Change them in Settings, Keybinds." width={520}>
      <ul className="shortcut-list">
        {rows.map((r) => (
          <li key={`${r.keys}-${r.label}`} className="shortcut-row">
            <span>{r.label}{r.global ? ' (global)' : ''}</span>
            <kbd className="kbd">{r.keys}</kbd>
          </li>
        ))}
      </ul>
      <div className="row-end">
        <Button variant="primary" data-autofocus onClick={close}>Done</Button>
      </div>
    </Modal>
  );
}

export function ConfirmDialog({ dialog }: { dialog: Extract<Dialog, { kind: 'confirm' }> }) {
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = useClose();
  return (
    <Modal open onClose={close} title={dialog.title} width={400}>
      <p className="confirm-body">{dialog.body}</p>
      {dialog.confirmText !== undefined && <Field label={`Type ${dialog.confirmText} to confirm`}>{(id) => <Input id={id} data-autofocus autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />}</Field>}
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="row-end">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button
          variant={dialog.danger ? 'danger' : 'primary'}
          loading={busy}
          data-autofocus={dialog.confirmText === undefined || undefined}
          disabled={dialog.confirmText !== undefined && confirmation !== dialog.confirmText}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await dialog.onConfirm();
              close();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
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
  return (
    <>
      <ActiveDialog />
      <InteractionModal />
    </>
  );
}

function ActiveDialog() {
  const dialog = useUiStore((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'botAuthorize': return <BotAuthorizeDialog key={JSON.stringify(dialog.request)} request={dialog.request} />;
    case 'createGuild': return <CreateGuildDialog />;
    case 'template': return <TemplateLinkDialog code={dialog.code} />;
    case 'joinGuild': return <JoinGuildDialog initial={dialog.code} />;
    case 'createChannel': return <CreateChannelDialog guildId={dialog.guildId} parentId={dialog.parentId} type={dialog.type} />;
    case 'invite': return <InviteDialog guildId={dialog.guildId} channelId={dialog.channelId} />;
    case 'newDm': return <NewDmDialog preselect={dialog.preselect} />;
    case 'groupDm': return <GroupDmDialog channelId={dialog.channelId} />;
    case 'screenPicker': return <ScreenPickerDialog />;
    case 'profile': return <ProfileDialog userId={dialog.userId} guildId={dialog.guildId} />;
    case 'customStatus': return <CustomStatusDialog />;
    case 'shortcuts': return <ShortcutsDialog />;
    case 'editNickname': return <EditNicknameDialog guildId={dialog.guildId} userId={dialog.userId} />;
    case 'notifications': return <ChannelNotificationDialog dialog={dialog} />;
    case 'folderSettings': return <FolderSettingsDialog folderId={dialog.folderId} />;
    case 'guildNotifications': return <GuildNotificationDialog guildId={dialog.guildId} />;
    case 'inbox': return <MentionsInbox />;
    case 'ban': return <BanDialog guildId={dialog.guildId} userId={dialog.userId} name={dialog.name} />;
    case 'prune': return <PruneDialog guildId={dialog.guildId} />;
    case 'modView': return <ModViewDialog guildId={dialog.guildId} userId={dialog.userId} />;
    case 'confirm': return <ConfirmDialog dialog={dialog} />;
    case 'forward': return <ForwardDialog message={dialog.message} />;
    case 'report': return <ReportDialog target={dialog.target} />;
    case 'reactionUsers': return <ReactionUsersDialog channelId={dialog.channelId} messageId={dialog.messageId} emoji={dialog.emoji} />;
  }
}
