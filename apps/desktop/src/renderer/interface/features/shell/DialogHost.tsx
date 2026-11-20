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
import { ChannelType, type Invite, type OnboardingResponse } from '@discordy/core/contracts/rest';
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
import { useStreamerActive } from '../../app/streamer';
import { ACTION_LABELS, FIXED_SHORTCUTS } from '@discordy/core/domain/shortcutCatalog';

function useClose() {
  return () => useUiStore.getState().openDialog(null);
}

function JoinGuildDialog({ initial, initialGuildId, initialFirstJoin }: { initial?: string; initialGuildId?: string; initialFirstJoin?: boolean }) {
  const [code, setCode] = useState(initial ?? '');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screening, setScreening] = useState<{ guildId: string; rules: string[]; revision: number } | null>(null);
  const [joinedGuildId, setJoinedGuildId] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [welcome, setWelcome] = useState<{ guildId: string; description: string; channels: { channel_id: string; description: string }[] } | null>(null);
  const [onboarding, setOnboarding] = useState<{ guildId: string; data: OnboardingResponse; choices: number[] } | null>(null);
  const close = useClose();
  const api = getRuntime().api;
  const finishJoin = async (guildId: string, firstJoin: boolean, suggestedChannel?: string) => {
    if (firstJoin) {
      try {
        const screen = await api.welcomeScreen(guildId);
        if (screen.enabled) { setWelcome({ guildId, description: screen.description, channels: screen.channels }); setScreening(null); return; }
      } catch (err) {
        useUiStore.getState().toast({ tone: 'warning', title: 'Could not load the welcome screen', body: errorMessage(err) });
      }
    }
    close();
    setTimeout(() => openGuild(guildId), 300);
    if (suggestedChannel) setTimeout(() => openChannel(suggestedChannel), 500);
  };
  const beginOnboarding = async (guildId: string, firstJoin: boolean) => {
    if (firstJoin) {
      try {
        const data = await api.onboarding(guildId);
        if (data.config.enabled && data.config.questions.length) {
          setScreening(null);
          setOnboarding({ guildId, data, choices: data.config.questions.map(() => -1) });
          return;
        }
      } catch (err) {
        useUiStore.getState().toast({ tone: 'warning', title: 'Could not load onboarding', body: errorMessage(err) });
      }
    }
    await finishJoin(guildId, firstJoin);
  };
  useEffect(() => {
    if (!initialGuildId) return;
    setBusy(true);
    api.memberVerification(initialGuildId).then((data) => {
      if (data.pending) setScreening({ guildId: initialGuildId, rules: data.rules, revision: data.revision });
      else {
        const userId = useSessionStore.getState().user?.id;
        const member = userId && useGuildStore.getState().members[initialGuildId]?.[userId];
        if (member) useGuildStore.getState().upsertMember(initialGuildId, { ...member, pending: false });
        void beginOnboarding(initialGuildId, !!initialFirstJoin);
      }
    }).catch((err: unknown) => setError(errorMessage(err))).finally(() => setBusy(false));
    // This dialog loads its initial server once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGuildId, initialFirstJoin]);
  const lookupCode = async (raw: string) => {
    setBusy(true);
    setError(null);
    try {
      const found = await api.invite(parseInviteCode(raw));
      const gid = found.guild?.id;
      if (gid && useGuildStore.getState().guilds[gid]) {
        const verification = await api.memberVerification(gid);
        if (verification.pending) setScreening({ guildId: gid, rules: verification.rules, revision: verification.revision });
        else { close(); openGuild(gid); }
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
      const joined = joinedGuildId ? null : await api.acceptInvite(invite.code);
      const gid = joinedGuildId ?? joined?.guild?.id ?? invite.guild?.id;
      if (!gid) throw new Error('The server was not returned by the invite.');
      setJoinedGuildId(gid);
      const verification = await api.memberVerification(gid);
      if (verification.pending) setScreening({ guildId: gid, rules: verification.rules, revision: verification.revision });
      else await beginOnboarding(gid, true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const acceptRules = async () => {
    if (!screening || !agreed) return;
    setBusy(true);
    setError(null);
    try {
      await api.acceptMemberVerification(screening.guildId, screening.revision);
      const userId = useSessionStore.getState().user?.id;
      const member = userId && useGuildStore.getState().members[screening.guildId]?.[userId];
      if (member) useGuildStore.getState().upsertMember(screening.guildId, { ...member, pending: false });
      await beginOnboarding(screening.guildId, true);
    } catch (err) {
      setError(errorMessage(err));
      setAgreed(false);
      try {
        const latest = await api.memberVerification(screening.guildId);
        setScreening({ guildId: screening.guildId, rules: latest.rules, revision: latest.revision });
      } catch { /* Keep the displayed rules and allow another attempt. */ }
    } finally { setBusy(false); }
  };
  const completeOnboarding = async () => {
    if (!onboarding || onboarding.choices.some((choice) => choice < 0)) return;
    setBusy(true); setError(null);
    try {
      const result = await api.completeOnboarding(onboarding.guildId, onboarding.data.revision, onboarding.choices);
      setOnboarding(null);
      await finishJoin(onboarding.guildId, true, result.channel_ids[0]);
    } catch (err) {
      setError(errorMessage(err));
      try {
        const data = await api.onboarding(onboarding.guildId);
        setOnboarding({ guildId: onboarding.guildId, data, choices: data.config.questions.map(() => -1) });
      } catch { /* Preserve the displayed choices for retry. */ }
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={close} title="Join a server" description={screening ? 'Review the server rules to continue.' : onboarding ? 'Choose what interests you.' : welcome ? 'Find a place to start.' : 'Enter an invite link or code.'}>
      {welcome ? (
        <div className="stack"><h3>Welcome</h3><p>{welcome.description}</p>
          {welcome.channels.map((channel) => <Button key={channel.channel_id} variant="ghost" onClick={() => { close(); openGuild(welcome.guildId); setTimeout(() => openChannel(channel.channel_id), 300); }}>{channel.description}</Button>)}
          <Button variant="primary" onClick={() => { close(); openGuild(welcome.guildId); }}>Continue</Button>
        </div>
      ) : onboarding ? (
        <div className="stack">
          {onboarding.data.config.questions.map((question, qi) => <fieldset key={qi}><legend>{question.title}</legend>
            {question.options.map((option, oi) => <label key={oi}><input type="radio" name={`onboarding-${qi}`} checked={onboarding.choices[qi] === oi} onChange={() => setOnboarding({ ...onboarding, choices: onboarding.choices.map((choice, i) => i === qi ? oi : choice) })} /> {option.label}</label>)}
          </fieldset>)}
          {error && <p role="alert">{error}</p>}
          <div className="row-end"><Button variant="ghost" onClick={() => { const id = onboarding.guildId; setOnboarding(null); void finishJoin(id, true); }}>Skip</Button><Button variant="primary" loading={busy} disabled={onboarding.choices.some((choice) => choice < 0)} onClick={() => void completeOnboarding()}>Continue</Button></div>
        </div>
      ) : initialGuildId && !screening ? (
        <div className="stack"><p>{error ?? 'Loading server rules…'}</p><Button variant="ghost" onClick={close}>Close</Button></div>
      ) : screening ? (
        <div className="stack">
          <h3>Server rules</h3>
          <ol>{screening.rules.map((rule, index) => <li key={index}>{rule}</li>)}</ol>
          <label><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I agree to these rules</label>
          {error && <p role="alert">{error}</p>}
          <div className="row-end"><Button variant="primary" loading={busy} disabled={!agreed} onClick={() => void acceptRules()}>Accept rules</Button></div>
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
          <div className="row-end">
            <Button variant="ghost" onClick={() => setInvite(null)}>Back</Button>
            <Button variant="primary" loading={busy} onClick={() => void accept()}>Accept invite</Button>
          </div>
          {error && <p role="alert">{error}</p>}
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
  const streamer = useStreamerActive();
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
            <Input readOnly value={streamer ? 'Hidden in streamer mode' : link} onFocus={(e) => e.currentTarget.select()} />
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
    case 'memberScreening': return <JoinGuildDialog initialGuildId={dialog.guildId} initialFirstJoin={dialog.firstJoin} />;
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
