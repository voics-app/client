import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { convertEmoticons } from '@discordy/core/domain/emoticons';
import { useDraftStore } from '@discordy/core/application/stores/composerStores';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { ScheduleSourceDraft } from '@discordy/core/application/scheduledCreateJournal';
import type { ScheduledMessageDraft } from '@discordy/core/contracts/scheduledMessages';
import { parseSilentPrefix, parseTtsCommand } from '@discordy/core/domain/appearance';
import { scheduleDraftError, scheduleUnavailable } from '@discordy/core/domain/scheduledMessages';
import { charsRemaining, showCounter } from '@discordy/core/domain/composerLimits';
import type { QuickEmoji } from '@discordy/core/domain/quickReactions';
import type { Channel } from '@discordy/core/contracts/rest';
import type { SlashEntry } from '@discordy/core/domain/slashCommand';
import { CommandSheet } from '../commands/CommandSheet';
import { SlashSuggestions } from '../commands/SlashSuggestions';
import { useSlashCommands } from '../commands/useSlashCommands';
import { theme } from '../theme';
import { ScheduledMessagesSheet, type ScheduleOpening, type SchedulingContext } from '../scheduling/ScheduledMessagesSheet';
import { useScheduledMessagesHost } from '../scheduling/ScheduledMessagesBoundary';
import { EmojiPicker } from '../emoji/EmojiPicker';
import { emojiText, insertAt } from '../emoji/emojiPickerModel';
import { AttachMenu, AttachmentOptions } from './AttachMenu';
import { addFiles } from './attachmentPicker';
import type { OutgoingFile } from './outgoingFile';
import { PendingFiles } from './PendingFiles';

/** Lets the keyboard gesture area find the input it hands the keyboard back to while the list is dragged. */
export const COMPOSER_INPUT_ID = 'composer-input';

export type ComposerMode = { kind: 'compose' } | { kind: 'reply'; messageId: string; authorName: string } | { kind: 'edit'; messageId: string; content: string };

export interface ComposerProps {
  mode: ComposerMode;
  /** Why the user cannot write here; replaces the input when set. */
  blockedReason: string | null;
  /** Hint inside the empty input, e.g. `Message #general`. */
  placeholder: string;
  /** Whether the + button offers photos, the camera and files (ATTACH_FILES, standard delivery). */
  canAttach: boolean;
  /** The server whose custom emoji the picker offers. */
  guildId?: string | undefined;
  /** The chat whose unsent text is kept as a draft (core `useDraftStore`, standard delivery only); without it nothing is kept. */
  draftKey?: string | undefined;
  /** The chat whose application commands `/` offers; absent where commands are not allowed (no permission, private delivery). */
  slashChannel?: Channel | undefined;
  /** Author-owned schedules remain accessible even when permission to send is lost. */
  scheduling?: SchedulingContext | undefined;
  onSubmit(text: string, mode: ComposerMode, files: OutgoingFile[]): void;
  onCancelMode(): void;
}

export function Composer({ mode, blockedReason, placeholder, canAttach, guildId, draftKey, slashChannel, scheduling, onSubmit, onCancelMode }: ComposerProps) {
  const scheduleHost = useScheduledMessagesHost();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [text, setText] = useState('');
  const [multiline, setMultiline] = useState(false);
  const [files, setFiles] = useState<OutgoingFile[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [command, setCommand] = useState<SlashEntry | null>(null);
  const [scheduleRequest, setScheduleRequest] = useState<ScheduleOpening | null>(null);
  const authorId = useSessionStore((state) => state.user?.id);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  useEffect(() => {
    // Composing (or replying) starts from the chat's draft; editing starts from the message.
    setText(mode.kind === 'edit' ? mode.content : draftKey ? (useDraftStore.getState().drafts[draftKey]?.text ?? '') : '');
    if (mode.kind === 'edit') setFiles([]);
    // A new mode or chat reloads the text; later keystrokes are the draft's to follow, not this effect's.
  }, [mode, draftKey]);
  useEffect(() => {
    if (!draftKey || mode.kind === 'edit') return;
    const timer = setTimeout(() => useDraftStore.getState().setDraft(draftKey, text, null), 400);
    return () => clearTimeout(timer);
  }, [text, draftKey, mode.kind]);
  const current = { text, editing: mode.kind === 'edit', replyTo: mode.kind === 'reply' ? mode.messageId : null, deliveryMode: scheduling?.mode, attachmentCount: files.length };
  const latest = useRef(current);
  latest.current = current;
  // Leaving the chat saves what was typed in the last moments, which the pause above has not saved yet.
  useEffect(
    () => () => {
      if (draftKey && !latest.current.editing) useDraftStore.getState().setDraft(draftKey, latest.current.text, null);
    },
    [draftKey],
  );

  const slash = useSlashCommands(slashChannel, text, mode.kind === 'compose');

  const schedulingDraft = (): ScheduledMessageDraft => {
    let content = text.trim();
    const tts = parseTtsCommand(content);
    if (tts !== null) content = tts;
    const silent = tts === null ? parseSilentPrefix(content) : null;
    if (silent !== null) content = silent;
    if (usePrefsStore.getState().convertEmoticons) content = convertEmoticons(content);
    return { content, tts: tts !== null, silent: silent !== null, reply_to: current.replyTo, replied_user: true };
  };
  const openScheduling = (initial: ScheduleOpening['initial']) => {
    if (!scheduling) return;
    const draft = schedulingDraft();
    const createDisabledReason = scheduleUnavailable({ mode: scheduling.mode, attachments: files.length, editing: current.editing, command: command !== null || (slash.query !== null && parseTtsCommand(text) === null), canSend: !blockedReason }) ?? scheduleDraftError(draft);
    if (initial === 'create' && createDisabledReason) { Alert.alert('Cannot schedule this message', createDisabledReason); return; }
    const request = { initial, draft, source: { text, replyTo: current.replyTo }, createDisabledReason };
    if (scheduleHost) scheduleHost.open({ request, context: scheduling, canSend: !blockedReason, onAccepted: scheduled, composerMounted: () => mounted.current, attachments: mode.kind === 'compose' && canAttach ? <AttachmentOptions onClose={() => scheduleHost.open(null)} onPicked={pick} /> : undefined });
    else setScheduleRequest(request);
  };
  const scheduled = (source: ScheduleSourceDraft | null) => {
    if (!source || latest.current.deliveryMode !== 'standard' || latest.current.editing || latest.current.attachmentCount > 0 || useSessionStore.getState().user?.id !== authorId || latest.current.text !== source.text || latest.current.replyTo !== source.replyTo) return;
    if (!mounted.current && (!draftKey || useDraftStore.getState().drafts[draftKey]?.text !== source.text)) return;
    latest.current.text = ''; setText('');
    if (draftKey) useDraftStore.getState().clearDraft(draftKey);
    if (source.replyTo) onCancelMode();
  };
  useEffect(() => {
    if (!scheduleHost) return;
    scheduleHost.accepted.current = scheduled;
    return () => { if (scheduleHost.accepted.current === scheduled) scheduleHost.accepted.current = null; };
  });

  if (blockedReason) {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedText}>{blockedReason}</Text>
        {scheduling && <><Pressable accessibilityRole="button" onPress={() => openScheduling('list')} style={styles.scheduleLink}><Text style={styles.bannerAction}>Scheduled messages</Text></Pressable><ScheduledMessagesSheet request={scheduleRequest} context={scheduling} canSend={false} onAccepted={scheduled} onClose={() => setScheduleRequest(null)} /></>}
      </View>
    );
  }

  const remaining = charsRemaining(text);
  const canSubmit = (text.trim() !== '' || files.length > 0) && remaining >= 0;
  const pick = (picked: OutgoingFile[]) => {
    const { files: next, problems } = addFiles(files, picked);
    setFiles(next);
    if (problems.length > 0) Alert.alert('Some files were not added', problems.join(' '));
  };
  const insertEmoji = (emoji: QuickEmoji) => {
    const at = insertAt(text, selection, emojiText(emoji));
    setText(at.text);
    setForcedSelection({ start: at.cursor, end: at.cursor });
    usePrefsStore.getState().recordReaction(emoji);
    setEmojiOpen(false);
  };
  const submit = () => {
    if (!canSubmit) return;
    const typed = text.trim();
    onSubmit(usePrefsStore.getState().convertEmoticons ? convertEmoticons(typed) : typed, mode, files);
    setText('');
    setFiles([]);
    if (draftKey && mode.kind !== 'edit') useDraftStore.getState().clearDraft(draftKey);
  };

  return (
    <View style={styles.wrap}>
      {mode.kind !== 'compose' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{mode.kind === 'reply' ? `Replying to ${mode.authorName}` : 'Editing message'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancelMode}>
            <Text style={styles.bannerAction}>Cancel</Text>
          </Pressable>
        </View>
      )}
      {slash.query !== null && (
        <SlashSuggestions
          entries={slash.entries}
          query={slash.query}
          appName={slash.appName}
          onPick={(entry) => {
            setText('');
            setCommand(entry);
          }}
        />
      )}
      {files.length > 0 && <PendingFiles files={files} onRemove={(i) => setFiles((current) => current.filter((_, at) => at !== i))} />}
      <View style={[styles.field, multiline ? styles.fieldGrown : styles.fieldSingle]}>
        {(scheduling || (mode.kind === 'compose' && canAttach)) && (
          <Pressable accessibilityRole="button" accessibilityLabel={scheduling ? 'Message actions' : 'Add attachment'} hitSlop={6} onPress={() => scheduling ? openScheduling('actions') : setAttachOpen(true)} style={styles.plus}>
            <Ionicons name="add" size={26} color={theme.muted} />
          </Pressable>
        )}
        <TextInput nativeID={COMPOSER_INPUT_ID} accessibilityLabel="Message" style={styles.input} value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={theme.subtle} multiline selection={forcedSelection} onSelectionChange={(e) => { setSelection(e.nativeEvent.selection); setForcedSelection(undefined); }} onContentSizeChange={(e) => setMultiline(isMultiline(e.nativeEvent.contentSize.height))} />
        <Pressable accessibilityRole="button" accessibilityLabel="Add emoji" hitSlop={6} onPress={() => setEmojiOpen(true)} style={styles.plus}>
          <Ionicons name="happy-outline" size={24} color={theme.muted} />
        </Pressable>
        {canSubmit && (
          <Pressable accessibilityRole="button" accessibilityLabel={mode.kind === 'edit' ? 'Save edit' : 'Send'} accessibilityHint={scheduling && mode.kind !== 'edit' ? 'Hold to send later' : undefined} onLongPress={scheduling && mode.kind !== 'edit' ? () => openScheduling('create') : undefined} onPress={submit} style={styles.send}>
            <Ionicons name={mode.kind === 'edit' ? 'checkmark' : 'arrow-up'} size={20} color={theme.accentText} />
          </Pressable>
        )}
      </View>
      {slashChannel && <CommandSheet entry={command} channel={slashChannel} onClose={() => setCommand(null)} />}
      <EmojiPicker visible={emojiOpen} guildId={guildId} onClose={() => setEmojiOpen(false)} onPick={insertEmoji} />
      <AttachMenu visible={attachOpen} onClose={() => setAttachOpen(false)} onPicked={pick} />
      {scheduling && <ScheduledMessagesSheet request={scheduleRequest} context={scheduling} canSend={true} attachments={mode.kind === 'compose' && canAttach ? <AttachmentOptions onClose={() => setScheduleRequest(null)} onPicked={pick} /> : undefined} onAccepted={scheduled} onClose={() => setScheduleRequest(null)} />}
      {showCounter(remaining) && <Text style={[styles.counter, remaining < 0 && styles.over]}>{remaining}</Text>}
    </View>
  );
}

/** The input is one line while its content is shorter than two lines; then the plus and send buttons centre on it, and from two lines they stick to the bottom. */
export const isMultiline = (contentHeight: number): boolean => contentHeight > LINE_HEIGHT * 1.5;
const LINE_HEIGHT = 21;

const SIZE = 44;
/** Plus, send and one line of input share this height, so a single-line field centres all three on one line. */
const BUTTON = 40;

const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.surface, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: theme.hairline },
  banner: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, paddingHorizontal: 6 },
  bannerText: { color: theme.muted, fontSize: 13 },
  bannerAction: { color: theme.accent, fontSize: 13, fontWeight: '600' },
  field: {
    flexDirection: 'row',
    backgroundColor: theme.raised,
    borderRadius: SIZE / 2 + 2,
    borderWidth: 1,
    borderColor: theme.hairlineStrong,
    paddingHorizontal: 5,
    paddingVertical: 4,
    minHeight: SIZE + 4,
  },
  fieldSingle: { alignItems: 'center' },
  fieldGrown: { alignItems: 'flex-end', borderRadius: 20 },
  plus: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: theme.text, fontSize: 16, lineHeight: LINE_HEIGHT, textAlignVertical: 'center', paddingHorizontal: 8, paddingTop: 9.5, paddingBottom: 9.5, minHeight: BUTTON, maxHeight: 132 },
  send: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  counter: { color: theme.muted, fontSize: 12, alignSelf: 'flex-end', paddingTop: 4 },
  over: { color: theme.danger },
  blocked: { backgroundColor: theme.surface, padding: 18 },
  blockedText: { color: theme.muted, textAlign: 'center' },
  scheduleLink: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
