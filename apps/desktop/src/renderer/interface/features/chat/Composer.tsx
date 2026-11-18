import { useI18n } from '../../shared/i18n';
import { convertEmoticons } from '@discordy/core/domain/emoticons';
import { scheduleDraftError, scheduleUnavailable } from '@discordy/core/domain/scheduledMessages';
import type { ScheduleSourceDraft } from '@discordy/core/application/scheduledCreateJournal';
import type { ScheduledMessageDraft } from '@discordy/core/contracts/scheduledMessages';
import { ArrowBendUpLeft, Clock, Code, EyeSlash, LockSimple, PaperPlaneRight, PlusCircle, Quotes, Smiley, TextB, TextItalic, TextStrikethrough, UploadSimple, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { DM_SCOPE, useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import { useMentionStore } from '@discordy/core/application/stores/mentionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { usePrefsStore, selectSendWithCtrlEnter } from '@discordy/core/application/stores/prefsStore';
import { acceptFiles, charsRemaining, formatCountdown, lastOwnEditable, MAX_MESSAGE_LENGTH, shouldPasteAsFile, showCounter, slowmodeRemaining } from '@discordy/core/domain/composerLimits';
import { applyFormat, enterAction, plusMenuEntries, type FormatKind } from '@discordy/core/domain/composerFormat';
import { searchShortcodes } from '@discordy/core/domain/emojiShortcodes';
import { timeTriggerMatches } from '@discordy/core/domain/timestampPicker';
import { useDraftStore, useReplyPingStore, useSlowmodeStore } from '@discordy/core/application/stores/composerStores';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { maxFileBytes } from '@discordy/core/domain/privateAttachment';
import { searchEntries, slashQuery, type OptionValues, type SlashEntry } from '@discordy/core/domain/slashCommand';
import { Permission } from '@discordy/core/contracts/permissions';
import { parseSilentPrefix, parseTtsCommand } from '@discordy/core/domain/appearance';
import { speak } from '@renderer/infrastructure/tts';
import type { Channel, DeliveryMode } from '@discordy/core/contracts/rest';
import { reportError } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { displayName } from '../../shared/hooks/useNames';
import { UserAvatar } from '../../shared/ui/UserAvatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Menu, useMenu, type MenuEntry } from '../../shared/ui/Menu';
import { ModeSwitcher } from '../privacy/ModeSwitcher';
import { PeerStatus } from '../privacy/PeerStatus';
import { useEmojiPopover } from './EmojiPopover';
import { SlashCommandPanel } from './SlashCommandPanel';
import { TimestampPicker } from './TimestampPicker';
import { ComposerFiles, type Descriptions } from './ComposerFiles';
import { ScheduledMessagesDialog } from '../scheduling/ScheduledMessagesDialog';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const TYPING_INTERVAL_MS = 8000;
const COMMAND_REFRESH_MS = 60_000;
const commandLoads = new Map<string, number>();

interface Suggestion {
  kind: 'user' | 'channel' | 'role' | 'emoji' | 'command' | 'timestamp';
  key: string;
  label: string;
  detail?: string;
  insert: string;
  avatar?: { id: string; name: string; avatar: string | null };
  /** Mention token to translate on send, e.g. `@ada` -> `<@123>`. */
  mention?: { token: string; wire: string };
  entry?: SlashEntry;
}

function activeToken(text: string, caret: number): { trigger: '@' | '#' | ':'; query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)([@#:])([\w.-]{0,32})$/.exec(before);
  if (!m) return null;
  const trigger = m[2] as '@' | '#' | ':';
  if (trigger === ':' && m[3]!.length < 2) return null;
  return { trigger, query: m[3]!.toLowerCase(), start: caret - m[3]!.length - 1 };
}

/** Remounted per channel so each channel starts from its own draft. */
export function Composer({ channel, mode }: { channel: Channel; mode: DeliveryMode }) {
  return <ComposerInner key={channel.id} channel={channel} mode={mode} />;
}

function initialDraft(channelId: string, standard: boolean) {
  return standard ? (useDraftStore.getState().drafts[channelId] ?? null) : null;
}

function ComposerInner({ channel, mode }: { channel: Channel; mode: DeliveryMode }) {
  const { t: msg } = useI18n();
  const { t, number, locale } = useI18n();
  const [text, setText] = useState(() => initialDraft(channel.id, mode === 'standard')?.text ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [descriptions, setDescriptions] = useState<Descriptions>(new Map());
  const [caret, setCaret] = useState(0);
  const [selected, setSelected] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [command, setCommand] = useState<SlashEntry | null>(null);
  const [commandValues, setCommandValues] = useState<OptionValues>({});
  const [running, setRunning] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<{ initial: 'list' | 'create'; draft: ScheduledMessageDraft; source: ScheduleSourceDraft } | null>(null);
  const plusMenu = useMenu();
  const sendWithCtrlEnter = usePrefsStore(selectSendWithCtrlEnter);
  const ref = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const fileInput = useRef<HTMLInputElement>(null);
  const mentionMap = useRef(new Map<string, string>());
  const lastTyping = useRef(0);
  const perms = useChannelPermissions(channel.id);
  const replyTo = useUiStore((s) => s.replyTo[channel.id]);
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const editing = useUiStore((s) => s.editing);
  const setEditing = useUiStore((s) => s.setEditing);
  const me = useSessionStore((s) => s.user?.id ?? null);
  const pingReplied = useReplyPingStore((s) => s.ping);
  const setPingReplied = useReplyPingStore((s) => s.setPing);
  const lastSent = useSlowmodeStore((s) => s.lastSent[channel.id]);
  const [now, setNow] = useState(() => Date.now());
  const members = useGuildStore((s) => (channel.guild_id ? s.members[channel.guild_id] : undefined));
  const guild = useGuildStore((s) => (channel.guild_id ? s.guilds[channel.guild_id] : undefined));
  const channels = useGuildStore((s) => s.channels);
  const density = usePrefsStore((s) => s.density);
  const scope = channel.guild_id ?? DM_SCOPE;
  const catalogue = useInteractionStore((s) => s.commands[scope]);
  const appNames = useInteractionStore((s) => s.appNames);

  const standard = mode === 'standard';
  const canSend = !channel.guild_id || can(perms, Permission.SEND_MESSAGES);
  const ttsAllowed = !channel.guild_id || can(perms, Permission.SEND_TTS_MESSAGES);
  const canAttach = !channel.guild_id || can(perms, Permission.ATTACH_FILES);

  const slowmodeBypass = !channel.guild_id || can(perms, Permission.MANAGE_CHANNELS) || can(perms, Permission.MANAGE_MESSAGES);
  const slowmodeLeft = standard && !slowmodeBypass ? slowmodeRemaining(channel.rate_limit_per_user, lastSent, now) : 0;
  const remainingChars = charsRemaining(text);
  const tooLong = remainingChars < 0;

  useEffect(() => {
    if (slowmodeLeft <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [slowmodeLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-channel draft (text and reply target), kept on this device for standard-mode channels only.
  useEffect(() => {
    const draft = initialDraft(channel.id, standard);
    if (draft?.replyTo && !useUiStore.getState().replyTo[channel.id]) setReplyTo(channel.id, draft.replyTo);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!standard) return;
    const id = setTimeout(() => useDraftStore.getState().setDraft(channel.id, text, replyTo ?? null), 300);
    return () => clearTimeout(id);
  }, [text, replyTo, standard, channel.id]);
  useEffect(
    () => () => {
      // Flush on unmount so a fast channel switch never loses the last keystrokes.
      if (mode === 'standard') useDraftStore.getState().setDraft(channel.id, textRef.current, useUiStore.getState().replyTo[channel.id] ?? null);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const canUseCommands = standard && (!channel.guild_id || can(perms, Permission.USE_APPLICATION_COMMANDS));
  const commandSearch = canUseCommands && !command ? slashQuery(text) : null;

  useEffect(() => {
    setCommand(null);
    setCommandValues({});
  }, [channel.id]);

  useEffect(() => {
    if (commandSearch === null) return;
    const interactions = getRuntime().interactions;
    if (channel.guild_id) {
      void interactions.loadGuildCommands(channel.guild_id).catch(() => undefined);
      return;
    }
    const last = commandLoads.get(scope) ?? 0;
    if (Date.now() - last < COMMAND_REFRESH_MS) return;
    commandLoads.set(scope, Date.now());
    const bots = (channel.recipients ?? []).filter((u) => u.bot).map((u) => ({ id: u.id, name: displayName(u) }));
    void interactions.loadDirectCommands(bots).catch(() => commandLoads.delete(scope));
  }, [commandSearch === null, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickingTime, setPickingTime] = useState(false);
  const emoji = useEmojiPopover(channel.guild_id, (picked) => insertAtCaret(picked.text + ' '), channel.id);

  // Mentions chosen from a member context menu are inserted into the open composer of that channel.
  const mentionRequest = useMentionStore((s) => s.request);
  useEffect(() => {
    if (!mentionRequest || mentionRequest.channelId !== channel.id) return;
    mentionMap.current.set(mentionRequest.token, mentionRequest.wire);
    insertAtCaret(`${mentionRequest.token} `);
    useMentionStore.getState().consume(mentionRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- insertAtCaret reads the text of the current render
  }, [mentionRequest, channel.id]);

  function insertAtCaret(value: string): void {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + value + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + value.length, start + value.length);
      setCaret(start + value.length);
    });
  }

  useEffect(() => {
    ref.current?.focus();
  }, [channel.id]);
  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const token = activeToken(text, caret);
  const suggestions = useMemo<Suggestion[]>(() => {
    if (commandSearch !== null) {
      return searchEntries(catalogue ?? [], commandSearch, 8).map<Suggestion>((entry) => ({
        kind: 'command',
        key: entry.key,
        label: `/${entry.label}`,
        detail: appNames[entry.command.application_id] ?? entry.description,
        insert: '',
        entry,
      }));
    }
    if (!token) return [];
    if (token.trigger === '@') {
      const users = Object.values(members ?? {})
        .filter((m) => displayName(m.user, m.nick).toLowerCase().includes(token.query) || m.user.username.toLowerCase().includes(token.query))
        .slice(0, 8)
        .map<Suggestion>((m) => {
          const name = displayName(m.user, m.nick);
          return { kind: 'user', key: m.user.id, label: name, detail: `@${m.user.username}`, insert: `@${name}`, avatar: { id: m.user.id, name, avatar: m.user.avatar }, mention: { token: `@${name}`, wire: `<@${m.user.id}>` } };
        });
      const roles = (guild?.roles ?? [])
        .filter((r) => r.mentionable && r.id !== guild?.id && r.name.toLowerCase().includes(token.query))
        .slice(0, 4)
        .map<Suggestion>((r) => ({ kind: 'role', key: r.id, label: r.name, detail: msg("settings.composer.role"), insert: `@${r.name}`, mention: { token: `@${r.name}`, wire: `<@&${r.id}>` } }));
      const everyone = can(perms, Permission.MENTION_EVERYONE) && 'everyone'.startsWith(token.query) ? [{ kind: 'role', key: 'everyone', label: 'everyone', detail: msg("settings.composer.notify.everyone"), insert: '@everyone' } satisfies Suggestion] : [];
      const here = can(perms, Permission.MENTION_EVERYONE) && 'here'.startsWith(token.query) ? [{ kind: 'role', key: 'here', label: 'here', detail: msg("settings.composer.notify.everyone"), insert: '@here' } satisfies Suggestion] : [];
      const time = timeTriggerMatches(token.query) ? [{ kind: 'timestamp', key: 'time', label: 'time', detail: msg("timestamp.title"), insert: '' } satisfies Suggestion] : [];
      return [...users, ...roles, ...everyone, ...here, ...time].slice(0, 8);
    }
    if (token.trigger === '#') {
      return Object.values(channels)
        .filter((c) => c.guild_id === channel.guild_id && c.type === 0 && (c.name ?? '').includes(token.query))
        .slice(0, 8)
        .map<Suggestion>((c) => ({ kind: 'channel', key: c.id, label: c.name ?? '', insert: `#${c.name}`, mention: { token: `#${c.name}`, wire: `<#${c.id}>` } }));
    }
    const custom = (guild ? guild.emojis : [])
      .filter((e) => e.id && e.name && e.name.toLowerCase().includes(token.query))
      .slice(0, 8)
      .map<Suggestion>((e) => ({ kind: 'emoji', key: e.id!, label: `:${e.name}:`, insert: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` }));
    const unicode = searchShortcodes(token.query, 8).map<Suggestion>((m) => ({ kind: 'emoji', key: `u:${m.name}`, label: `${m.emoji} :${m.name}:`, insert: m.emoji }));
    return [...custom, ...unicode].slice(0, 8);
  }, [token, members, guild, channels, channel.guild_id, perms, commandSearch, catalogue, appNames, msg]);

  useEffect(() => setSelected(0), [token?.trigger, token?.query, commandSearch]);

  const accept = (s: Suggestion) => {
    if (s.entry) {
      setCommand(s.entry);
      setCommandValues({});
      setText('');
      setCaret(0);
      return;
    }
    if (!token) return;
    if (s.kind === 'timestamp') {
      const next = text.slice(0, token.start) + text.slice(caret);
      setText(next);
      setCaret(token.start);
      ref.current?.setSelectionRange(token.start, token.start);
      setPickingTime(true);
      return;
    }
    const next = `${text.slice(0, token.start)}${s.insert} ${text.slice(caret)}`;
    if (s.mention) mentionMap.current.set(s.mention.token, s.mention.wire);
    setText(next);
    const pos = token.start + s.insert.length + 1;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (!canAttach) {
        reportError(new Error(msg("settings.composer.you.do.not.have.permission.to.attach.files.here")), msg("settings.composer.cannot.attach.files"));
        return;
      }
      const limit = mode === 'standard' ? MAX_FILE_BYTES : maxFileBytes(mode);
      const { accepted, problems } = acceptFiles(files, incoming, limit, mode === 'standard', undefined, locale);
      if (problems.length > 0) reportError(new Error(problems.join(' ')), msg("settings.composer.file.not.attached"));
      if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
    },
    [canAttach, mode, files, msg, locale],
  );

  const runCommand = async () => {
    if (!command || running) return;
    setRunning(true);
    try {
      await getRuntime().interactions.invoke(channel, command, commandValues);
      setCommand(null);
      setCommandValues({});
      requestAnimationFrame(() => ref.current?.focus());
    } catch (e) {
      reportError(e, msg("settings.composer.command.failed"));
    } finally {
      setRunning(false);
    }
  };

  const send = async () => {
    if (command) return runCommand();
    let content = text.trim();
    const prefs = usePrefsStore.getState();
    const ttsText = parseTtsCommand(content);
    let tts = false;
    if (content.toLowerCase().startsWith('/tts ') && ttsText) {
      if (!standard || !ttsAllowed) {
        reportError(new Error(!ttsAllowed ? msg("settings.composer.you.do.not.have.permission.to.send.text.to") : msg("settings.composer.text.to.speech.messages.need.a.standard.chat")), msg("settings.composer.cannot.send.tts"));
        return;
      }
      if (!prefs.ttsReadAloud) {
        reportError(new Error(msg("settings.composer.turn.on.text.to.speech.in.settings.accessibility.to")), msg("settings.composer.text.to.speech.is.off"));
        return;
      }
      content = ttsText;
      tts = true;
    }
    let silent = false;
    const silentText = standard && !tts ? parseSilentPrefix(content) : null;
    if (silentText !== null) {
      content = silentText;
      silent = true;
    }
    if (!content && files.length === 0) return;
    if (tooLong) {
      reportError(new Error(msg("composer.tooLongError", { limit: MAX_MESSAGE_LENGTH, count: -remainingChars })), msg("settings.composer.message.too.long"));
      return;
    }
    if (slowmodeLeft > 0) return;
    for (const [tok, wire] of mentionMap.current) content = content.split(tok).join(wire);
    if (prefs.convertEmoticons) content = convertEmoticons(content);
    const input = {
      content,
      files: files.length > 0 ? files : undefined,
      fileOptions: files.map((f) => ({ description: descriptions.get(f) })),
      replyTo: replyTo?.id ?? null,
      tts,
      silent,
      pingReplied: replyTo && replyTo.author.id !== me ? pingReplied : true,
    };
    const draft = { text, files, descriptions };
    setText('');
    setFiles([]);
    setDescriptions(new Map());
    setReplyTo(channel.id, null);
    mentionMap.current.clear();
    if (standard) useSlowmodeStore.getState().markSent(channel.id);
    try {
      await getRuntime().privacy.sender.send(channel, input);
      if (tts) speak(content, prefs.ttsRate);
    } catch (e) {
      if (standard) useSlowmodeStore.getState().markSent(channel.id, 0);
      const cancelled = e instanceof Error && e.name === 'UploadCancelled';
      if (!cancelled && !useUiStore.getState().toasts.some((t) => t.body === (e instanceof Error ? e.message : ''))) reportError(e, msg("settings.composer.message.not.sent"));
      setText((current) => current || draft.text);
      setFiles((current) => (current.length > 0 ? current : draft.files));
      setDescriptions((current) => (current.size > 0 ? current : draft.descriptions));
    }
  };

  const notifyTyping = () => {
    if (!standard || !text) return;
    const now = Date.now();
    if (now - lastTyping.current < TYPING_INTERVAL_MS) return;
    lastTyping.current = now;
    void getRuntime().api.typing(channel.id).catch(() => undefined);
  };

  const format = (kind: FormatKind) => {
    const el = ref.current;
    if (!el) return;
    const edit = applyFormat(text, el.selectionStart, el.selectionEnd, kind);
    setText(edit.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(edit.start, edit.end);
      setCaret(edit.end);
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles([...e.dataTransfer.files]);
  };
  const onPaste = (e: ClipboardEvent) => {
    const pasted = [...e.clipboardData.files];
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
      return;
    }
    const pastedText = e.clipboardData.getData('text/plain');
    if (canAttach && shouldPasteAsFile(pastedText)) {
      e.preventDefault();
      setPendingPaste(pastedText);
    }
  };
  const resolvePaste = (asFile: boolean) => {
    const pasted = pendingPaste;
    setPendingPaste(null);
    if (pasted === null) return;
    if (asFile) addFiles([new File([pasted], 'message.txt', { type: 'text/plain' })]);
    else insertAtCaret(pasted);
  };

  const schedulingDraft = (): ScheduledMessageDraft => {
    let content = text.trim();
    const tts = parseTtsCommand(content);
    if (tts !== null) content = tts;
    const silent = tts === null ? parseSilentPrefix(content) : null;
    if (silent !== null) content = silent;
    for (const [token, wire] of mentionMap.current) content = content.split(token).join(wire);
    if (usePrefsStore.getState().convertEmoticons) content = convertEmoticons(content);
    return { content, tts: tts !== null, silent: silent !== null, reply_to: replyTo?.id ?? null, replied_user: replyTo?.author.id !== me ? pingReplied : true };
  };
  const schedulingUnavailable = scheduleUnavailable({ mode, attachments: files.length, editing: editing?.channelId === channel.id, command: command !== null || (commandSearch !== null && parseTtsCommand(text) === null), canSend }) ?? scheduleDraftError(schedulingDraft());
  const openScheduling = (initial: 'list' | 'create') => setSchedule({ initial, draft: schedulingDraft(), source: { text, replyTo: replyTo?.id ?? null } });
  const scheduled = (source: ScheduleSourceDraft | null) => {
    if (!source || mode !== 'standard' || files.length > 0 || useUiStore.getState().editing?.channelId === channel.id || useSessionStore.getState().user?.id !== me || textRef.current !== source.text || (useUiStore.getState().replyTo[channel.id]?.id ?? null) !== source.replyTo) return;
    textRef.current = ''; setText(''); setReplyTo(channel.id, null); mentionMap.current.clear();
    useDraftStore.getState().clearDraft(channel.id);
  };
  const plusEntries: MenuEntry[] = [...plusMenuEntries().map((id): MenuEntry => {
    if (id === 'upload') return { kind: 'item', label: t('composer.upload'), icon: <UploadSimple size={16} />, disabled: !canSend || !canAttach, title: canAttach ? undefined : t('composer.noAttachments'), onSelect: () => fileInput.current?.click() };
    const label = id === 'thread' ? msg('settings.composer.create.thread') : id === 'poll' ? msg('settings.composer.create.poll') : msg('settings.composer.use.apps');
    return { kind: 'item', label, disabled: true, onSelect: () => undefined };
  }), { kind: 'separator' }, { kind: 'item', label: 'Send later', icon: <Clock size={16} />, disabled: Boolean(schedulingUnavailable), title: schedulingUnavailable ?? undefined, onSelect: () => openScheduling('create') }, { kind: 'item', label: 'Scheduled messages', onSelect: () => openScheduling('list') }];
  const FORMATS: { kind: FormatKind; label: string; icon: ReactNode }[] = [
    { kind: 'bold', label: t('composer.bold'), icon: <TextB size={16} /> },
    { kind: 'italic', label: t('composer.italic'), icon: <TextItalic size={16} /> },
    { kind: 'strike', label: t('composer.strike'), icon: <TextStrikethrough size={16} /> },
    { kind: 'spoiler', label: t('composer.spoiler'), icon: <EyeSlash size={16} /> },
    { kind: 'code', label: t('composer.code'), icon: <Code size={16} /> },
    { kind: 'quote', label: t('composer.quote'), icon: <Quotes size={16} /> },
  ];

  const placeholder = !canSend ? t('composer.noPermission') : t('chat.messageTo', { name: channel.guild_id ? `#${channel.name}` : channel.recipients?.length === 1 ? `@${displayName(channel.recipients[0]!)}` : t('composer.group') });
  const replyName = replyTo ? displayName(replyTo.author) : '';

  return (
    <div className={`composer-wrap density-${density}`} onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes(msg("settings.composer.files"))) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <PeerStatus channel={channel} mode={mode} />
      {suggestions.length > 0 && (
        <ul className="suggestions glass" role="listbox" aria-label={t(commandSearch !== null ? 'composer.commands' : 'composer.suggestions')}>
          {suggestions.map((s, i) => (
            <li key={s.key} role="option" aria-selected={i === selected}>
              <button type="button" className={i === selected ? 'is-selected' : ''} onMouseEnter={() => setSelected(i)} onMouseDown={(e) => { e.preventDefault(); accept(s); }}>
                {s.avatar && <UserAvatar id={s.avatar.id} name={s.avatar.name} avatar={s.avatar.avatar} guildId={channel.guild_id} size={22} />}
                <span>{s.label}</span>
                {s.detail && <span className="suggestion-detail">{s.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={`composer${dragging ? ' is-dragging' : ''}${!canSend ? ' is-disabled' : ''}`}>
        {replyTo && (
          <div className="composer-reply">
            <ArrowBendUpLeft size={14} /> <strong>{t('composer.replyingTo', { name: replyName })}</strong>
            <span className="composer-reply-text">{replyTo.content}</span>
            {replyTo.author.id !== me && (
              <button
                type="button"
                className={`composer-reply-ping${pingReplied ? ' is-on' : ''}`}
                aria-pressed={pingReplied}
                aria-label={t(pingReplied ? 'composer.mentionOnName' : 'composer.mentionOffName', { name: replyName })}
                title={t(pingReplied ? 'composer.mentionOn' : 'composer.mentionOff')}
                onClick={() => setPingReplied(!pingReplied)}
              >
                @ {t(pingReplied ? 'composer.on' : 'composer.off')}
              </button>
            )}
            <IconButton label={t('composer.cancelReply')} size="sm" onClick={() => setReplyTo(channel.id, null)}><X size={14} /></IconButton>
          </div>
        )}
        <ComposerFiles files={files} descriptions={descriptions} allowDescriptions={standard} onChange={(next, nextDescriptions) => { setFiles(next); setDescriptions(nextDescriptions); }} />
        {command && (
          <SlashCommandPanel entry={command} values={commandValues} channel={channel} busy={running} onChange={setCommandValues} onRun={() => void runCommand()} onCancel={() => { setCommand(null); ref.current?.focus(); }} />
        )}
        {pendingPaste !== null && (
          <div className="composer-paste" role="alertdialog" aria-label={t('composer.longPaste')}>
            <span>{t('composer.pasteLimit', { count: [...pendingPaste].length, limit: MAX_MESSAGE_LENGTH })}</span>
            <button type="button" className="composer-paste-btn is-primary" autoFocus onClick={() => resolvePaste(true)}>{t('composer.convertFile')}</button>
            <button type="button" className="composer-paste-btn" onClick={() => resolvePaste(false)}>{t('composer.sendAsMessage')}</button>
            <IconButton label={t('composer.dismiss')} size="sm" onClick={() => { setPendingPaste(null); ref.current?.focus(); }}><X size={14} /></IconButton>
          </div>
        )}
        {hasSelection && canSend && !command && (
          <div className="composer-format" role="toolbar" aria-label={t('composer.formatting')}>
            {FORMATS.map((f) => (
              <IconButton key={f.kind} label={f.label} size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => format(f.kind)}>{f.icon}</IconButton>
            ))}
          </div>
        )}
        <div className="composer-row">
          <IconButton label={t('composer.add')} aria-haspopup="menu" aria-expanded={plusMenu.open} onClick={plusMenu.openBelow}>
            <PlusCircle size={22} />
          </IconButton>
          <Menu open={plusMenu.open} x={plusMenu.anchor?.x ?? 0} y={plusMenu.anchor?.y ?? 0} entries={plusEntries} onClose={plusMenu.close} minWidth={180} />
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
          <textarea
            ref={ref}
            className="composer-input"
            rows={1}
            value={text}
            disabled={!canSend}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); notifyTyping(); }}
            onSelect={(e) => { setCaret(e.currentTarget.selectionStart); setHasSelection(e.currentTarget.selectionEnd > e.currentTarget.selectionStart); }}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (suggestions.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => (i + 1) % suggestions.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(suggestions[selected]!); return; }
                if (e.key === 'Escape') { setCaret(0); return; }
              }
              if (e.key === 'ArrowUp' && !text && files.length === 0 && !command && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const timeline = useMessageStore.getState().timelines[channel.id];
                const last = lastOwnEditable(timeline ? timeline.ids.map((id) => timeline.byId[id]!).filter(Boolean) : [], me);
                if (last) { e.preventDefault(); setEditing({ channelId: channel.id, messageId: last.id }); return; }
              }
              if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); format('strike'); return; }
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); format('bold'); return; }
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); format('italic'); return; }
              const action = enterAction({ key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, isComposing: e.nativeEvent.isComposing }, sendWithCtrlEnter);
              if (action === 'send') { e.preventDefault(); void send(); }
              if (e.key === 'Escape') {
                if (editing?.channelId === channel.id) setEditing(null);
                else if (replyTo) setReplyTo(channel.id, null);
              }
            }}
          />
          {showCounter(remainingChars) && (
            <span className={`composer-counter${tooLong ? ' is-over' : ''}`} role="status" aria-label={t('composer.charactersLeft', { count: remainingChars })}>{number(remainingChars)}</span>
          )}
          {slowmodeLeft > 0 && <span className="composer-slowmode" role="timer" aria-label={t('composer.slowmodeLabel', { count: slowmodeLeft })}>{t('composer.slowmode', { time: formatCountdown(slowmodeLeft, locale) })}</span>}
          <ModeSwitcher channel={channel} mode={mode} />
          <IconButton label={t('composer.timestamp')} disabled={!canSend} onClick={() => setPickingTime(true)}><Clock size={22} /></IconButton>
          <IconButton label={t('composer.emoji')} disabled={!canSend} onClick={(e) => emoji.open(e.currentTarget, true)}><Smiley size={22} /></IconButton>
          <IconButton label={slowmodeLeft > 0 ? t('composer.wait', { count: slowmodeLeft }) : t('composer.send')} tone="accent" active={Boolean((text.trim() || files.length || command) && !tooLong && slowmodeLeft === 0)} disabled={!canSend || slowmodeLeft > 0 || tooLong || (!command && !text.trim() && files.length === 0)} onClick={() => void send()}>
            <PaperPlaneRight size={20} weight="fill" />
          </IconButton>
        </div>
        {!standard && (
          <p className="composer-note"><LockSimple size={12} weight="fill" /> {mode === 'ephemeral' ? msg("settings.composer.end.to.end.encrypted.with.mls.kept.only.on") : msg("settings.composer.sent.directly.to.your.peer.kept.only.on.your")}</p>
        )}
        {dragging && <div className="drop-overlay">{t('composer.drop')}</div>}
      </div>
      {emoji.node}
      {schedule && <ScheduledMessagesDialog channelId={channel.id} mode={mode} initial={schedule.initial} draft={schedule.draft} source={schedule.source} createDisabledReason={schedulingUnavailable} canSend={canSend} canTts={ttsAllowed} onAccepted={scheduled} onClose={() => setSchedule(null)} />}
      <TimestampPicker open={pickingTime} onClose={() => setPickingTime(false)} onInsert={(markup) => { setPickingTime(false); insertAtCaret(`${markup} `); }} />
    </div>
  );
}
