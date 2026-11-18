import { useI18n } from '../../shared/i18n';
import { ChannelNotificationDialog, GuildNotificationDialog } from '../notifications/NotificationDialogs';
import { MentionsInbox } from '../notifications/MentionsInbox';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dmCandidates } from '@discordy/core/application/dmCandidates';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore, type Dialog } from '@discordy/core/application/stores/uiStore';
import { inviteWebUrl, parseInviteCode } from '@discordy/core/domain/inviteLinks';
import { ChannelType, type Invite } from '@discordy/core/contracts/rest';
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
  const { t: msg } = useI18n();
  const [code, setCode] = useState(initial ?? '');
  const [invite, setInvite] = useState<Invite | null>(null);
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
        useUiStore.getState().toast({ tone: 'info', title: msg("invite.alreadyMember", { name: found.guild?.name ?? msg("invite.thisServer") }) });
        return;
      }
      setInvite(found);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      // A link opened from outside the form has nowhere to show the field error.
      if (initial) useUiStore.getState().toast({ tone: 'danger', title: msg("settings.dialoghost.invite.is.invalid.or.has.expired"), body: message });
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
    const joined = await attempt(() => api.acceptInvite(invite.code), msg("settings.dialoghost.could.not.join.server"));
    setBusy(false);
    if (joined) {
      close();
      const gid = joined.guild?.id ?? invite.guild?.id;
      if (gid) setTimeout(() => openGuild(gid), 300);
    }
  };
  return (
    <Modal open onClose={close} title={msg("settings.dialoghost.join.a.server")} description={msg("settings.dialoghost.enter.an.invite.link.or.code")}>
      {invite ? (
        <div className="stack">
          <div className="invite-card">
            <Avatar id={invite.guild?.id} name={invite.guild?.name ?? '?'} avatar={invite.guild?.icon} size={56} square kind="icons" />
            <div>
              <h3>{invite.guild?.name}</h3>
              <p>{invite.approximate_member_count === undefined ? msg("invite.unknownMembers") : msg("common.members", { count: invite.approximate_member_count })} · {msg("invite.online", { count: invite.approximate_presence_count ?? -1 })}</p>
            </div>
          </div>
          <div className="row-end">
            <Button variant="ghost" onClick={() => setInvite(null)}>{msg("settings.createguilddialog.back")}</Button>
            <Button variant="primary" loading={busy} onClick={() => void accept()}>{msg("settings.dialoghost.accept.invite")}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={lookup} className="stack">
          <Field label={msg("settings.dialoghost.invite.link.or.code")} error={error}>
            {(id) => <Input id={id} data-autofocus value={code} placeholder={`${BRAND.landingUrl}/invite/hTKzmak`} onChange={(e) => setCode(e.target.value)} />}
          </Field>
          <div className="row-end">
            <Button variant="ghost" onClick={close}>{msg("common.cancel")}</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={code.trim().length < 4}>{msg("settings.accountsecurity.continue")}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CreateChannelDialog({ guildId, parentId, type: initialType }: { guildId: string; parentId: string | null; type?: number }) {
  const { t: msg } = useI18n();
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
      msg("settings.dialoghost.could.not.create.channel"),
    );
    setBusy(false);
    if (channel) {
      useGuildStore.getState().upsertChannel({ ...channel, guild_id: guildId });
      close();
      if (!isCategory && channel.type === ChannelType.GUILD_TEXT) useUiStore.getState().navigate({ kind: 'guild', guildId, channelId: channel.id });
    }
  };
  return (
    <Modal open onClose={close} title={isCategory ? msg("settings.dialoghost.create.category") : msg("settings.dialoghost.create.channel")}>
      <form onSubmit={submit} className="stack">
        {!initialType && (
          <Segmented
            label={msg("settings.dialoghost.channel.type")}
            value={String(type)}
            onChange={(v) => setType(Number(v))}
            options={[
              { value: String(ChannelType.GUILD_TEXT), label: msg("domain.text") },
              { value: String(ChannelType.GUILD_VOICE), label: msg("keybind.label.voice") },
              { value: String(ChannelType.GUILD_ANNOUNCEMENT), label: msg("settings.dialoghost.announcement") },
              { value: String(ChannelType.GUILD_FORUM), label: msg("settings.dialoghost.forum") },
            ]}
          />
        )}
        <Field label={isCategory ? msg("settings.dialoghost.category.name") : msg("settings.channelsettings.channel.name")}>
          {(id) => <Input id={id} data-autofocus value={name} maxLength={100} placeholder={isCategory ? msg("settings.dialoghost.new.category") : msg("settings.dialoghost.new.channel")} onChange={(e) => setName(e.target.value)} />}
        </Field>
        {type === ChannelType.GUILD_TEXT && (
          <Field label={msg("settings.channelsettings.delivery.mode")} hint={msg("settings.dialoghost.ephemeral.channels.are.end.to.end.encrypted.and.limited")}>
            {() => (
              <Segmented label={msg("settings.channelsettings.delivery.mode")} value={mode} onChange={setMode} options={[{ value: 'standard', label: msg("settings.dialoghost.standard") }, { value: 'ephemeral', label: msg("settings.dialoghost.ephemeral.e2ee") }]} />
            )}
          </Field>
        )}
        <div className="row-end">
          <Button variant="ghost" onClick={close}>{msg("common.cancel")}</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 1}>{msg("settings.dialoghost.create")}</Button>
        </div>
      </form>
    </Modal>
  );
}

function InviteDialog({ guildId, channelId }: { guildId: string; channelId: string }) {
  const { t: msg } = useI18n();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [maxAge, setMaxAge] = useState('86400');
  const [maxUses, setMaxUses] = useState('0');
  const [busy, setBusy] = useState(false);
  const close = useClose();
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const generate = async () => {
    setBusy(true);
    const created = await attempt(() => getRuntime().api.createInvite(channelId, { max_age: Number(maxAge), max_uses: Number(maxUses) }), msg("settings.dialoghost.could.not.create.invite"));
    setBusy(false);
    if (created) setInvite(created);
  };
  const apiUrl = useConnectionStore((c) => c.apiUrl);
  const link = invite ? inviteWebUrl(invite.code, apiUrl) : '';
  return (
    <Modal open onClose={close} title={msg("invite.peopleTo", { name: guild?.name ?? msg("invite.thisServer") })} description={msg("settings.dialoghost.share.this.link.so.others.can.join")}>
      <div className="stack">
        {invite ? (
          <div className="invite-link">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="primary" onClick={() => void copyText(link, msg("settings.servertabs.invite.link.copied"))}>{msg("settings.backupcodeslist.copy")}</Button>
          </div>
        ) : (
          <>
            <Field label={msg("settings.dialoghost.expire.after")}>
              {(id) => (
                <Select id={id} value={maxAge} onChange={(e) => setMaxAge(e.target.value)}>
                  <option value="1800">{msg("settings.dialoghost.30.minutes")}</option><option value="3600">{msg("settings.usertabs.1.hour")}</option><option value="86400">{msg("settings.dialoghost.1.day")}</option><option value="604800">{msg("settings.dialoghost.7.days")}</option><option value="0">{msg("settings.usertabs.never")}</option>
                </Select>
              )}
            </Field>
            <Field label={msg("settings.dialoghost.max.uses")}>
              {(id) => (
                <Select id={id} value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
                  <option value="0">{msg("settings.dialoghost.no.limit")}</option><option value="1">{msg("settings.dialoghost.1.use")}</option><option value="5">{msg("settings.dialoghost.5.uses")}</option><option value="25">{msg("settings.dialoghost.25.uses")}</option><option value="100">{msg("settings.dialoghost.100.uses")}</option>
                </Select>
              )}
            </Field>
            <div className="row-end"><Button variant="primary" loading={busy} onClick={() => void generate()}>{msg("settings.dialoghost.generate.invite.link")}</Button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

function NewDmDialog({ preselect }: { preselect?: string[] }) {
  const { t: msg } = useI18n();
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
    const channel = await attempt(() => getRuntime().api.openPrivateChannel(picked), msg("friends.openFailed"));
    setBusy(false);
    if (channel) {
      useGuildStore.getState().upsertChannel(channel);
      close();
      openChannel(channel.id);
    }
  };
  return (
    <Modal open onClose={close} title={msg("home.newMessage")} description={msg("settings.dialoghost.pick.one.person.for.a.dm.or.several.for")}>
      <div className="stack">
        <Input data-autofocus placeholder={msg("settings.dialoghost.find.a.person")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={msg("settings.dialoghost.find.a.person")} />
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
          {list.length === 0 && <li className="pick-empty">{msg("settings.dialoghost.no.people.found.join.a.server.or.add.friends")}</li>}
        </ul>
        <div className="row-end">
          <Button variant="ghost" onClick={close}>{msg("common.cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={picked.length === 0} onClick={() => void create()}>{picked.length > 1 ? msg("settings.dialoghost.create.group") : msg("settings.dialoghost.open.conversation")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CustomStatusDialog() {
  const { t: msg, catalogText } = useI18n();
  const current = useSessionStore((s) => s.settings.custom_status);
  const [text, setText] = useState(current?.text ?? '');
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const [emoji, setEmoji] = useState<StatusEmoji | null>(current?.emoji_name ? { name: current.emoji_name, id: current.emoji_id } : null);
  const [expiry, setExpiry] = useState<ExpiryChoice>('never');
  const picker = useEmojiPopover(null, (e) => setEmoji({ name: e.emoji.name ?? e.api, id: e.emoji.id }));
  const close = useClose();
  const left = statusCharsLeft(text);
  return (
    <Modal open onClose={close} title={msg("settings.dialoghost.set.a.custom.status")} width={420}>
      <div className="stack">
        <Field label={msg("settings.dialoghost.what.s.happening")} hint={<span className="status-counter" aria-live="polite">{msg("status.charactersLeft", { count: left })}</span>}>
          {(id) => (
            <div className="status-field">
              <IconButton label={emoji ? msg("settings.dialoghost.change.emoji") : msg("settings.dialoghost.add.emoji")} onClick={(e) => picker.open(e.currentTarget, false)}>
                {emoji?.id ? <img className="status-emoji" src={`${cdn}/emojis/${emoji.id}.png`} alt={emoji.name} /> : emoji ? <span>{emoji.name}</span> : <Smiley size={20} />}
              </IconButton>
              <Input id={id} data-autofocus value={text} maxLength={CUSTOM_STATUS_MAX} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
        </Field>
        {emoji && <Button variant="ghost" onClick={() => setEmoji(null)}>{msg("settings.dialoghost.remove.emoji")}</Button>}
        <Field label={msg("settings.dialoghost.clear.after")}>{(id) => <Select id={id} value={expiry} onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}>{EXPIRY_CHOICES.map((c) => <option key={c.id} value={c.id}>{catalogText(c.label)}</option>)}</Select>}</Field>
        <div className="row-end">
          <Button variant="ghost" onClick={() => { void setStatusText(null); close(); }}>{msg("settings.usertabs.clear")}</Button>
          <Button variant="primary" onClick={() => { void setStatusText(text.trim() || null, expiryFor(expiry, new Date()), emoji); close(); }}>{msg("common.save")}</Button>
        </div>
      </div>
      {picker.node}
    </Modal>
  );
}

function ShortcutsDialog() {
  const { t: msg, catalogText } = useI18n();
  const close = useClose();
  const keybinds = usePrefsStore((s) => s.keybinds);
  const pttLabel = usePrefsStore((s) => s.pttLabel);
  const bound = keybinds.filter((k) => k.keys).map((k) => ({ keys: k.keys, label: ACTION_LABELS[k.action] ?? k.action, global: Boolean(k.global) }));
  const rows = [...bound, ...(pttLabel ? [{ keys: pttLabel, label: msg("settings.usertabs.push.to.talk"), global: true }] : []), ...FIXED_SHORTCUTS.map((f) => ({ keys: f.keys, label: f.label, global: false }))];
  return (
    <Modal open onClose={close} title={msg("settings.dialoghost.keyboard.shortcuts")} description={msg("settings.dialoghost.change.them.in.settings.keybinds")} width={520}>
      <ul className="shortcut-list">
        {rows.map((r) => (
          <li key={`${r.keys}-${r.label}`} className="shortcut-row">
            <span>{r.global ? msg("shortcuts.globalLabel", { name: catalogText(r.label) }) : catalogText(r.label)}</span>
            <kbd className="kbd">{r.keys}</kbd>
          </li>
        ))}
      </ul>
      <div className="row-end">
        <Button variant="primary" data-autofocus onClick={close}>{msg("common.done")}</Button>
      </div>
    </Modal>
  );
}

export function ConfirmDialog({ dialog }: { dialog: Extract<Dialog, { kind: 'confirm' }> }) {
  const { t: msg } = useI18n();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = useClose();
  return (
    <Modal open onClose={close} title={dialog.title} width={400}>
      <p className="confirm-body">{dialog.body}</p>
      {dialog.confirmText !== undefined && <Field label={msg("confirm.typeText", { text: dialog.confirmText })}>{(id) => <Input id={id} data-autofocus autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />}</Field>}
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="row-end">
        <Button variant="ghost" onClick={close}>{msg("common.cancel")}</Button>
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
