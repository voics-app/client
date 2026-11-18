import { createI18n } from '@discordy/core/domain/i18n';
import { useAgeRestrictedStore } from '@discordy/core/application/stores/ageRestrictedStore';
import { useChannelContentAccess } from '../safety/useChannelContentAccess';
import { uuid } from 'expo';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { deviceStorage } from '@discordy/core/application/ports/deviceStorage';
import type { ScheduleSourceDraft } from '@discordy/core/application/scheduledCreateJournal';
import { ScheduledMessages } from '@discordy/core/application/scheduledMessages';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import type { ScheduledMessage, ScheduledMessageDraft } from '@discordy/core/contracts/scheduledMessages';
import { scheduleStatus, scheduleTimeLabel } from '@discordy/core/domain/scheduledMessages';
import { useScheduledMessages } from '@discordy/react/useScheduledMessages';
import { useAppActive } from '../messages/useAppActive';
import { getRuntime } from '../runtime';
import { useLastValue } from '../sheets/useLastValue';
import { space, theme, type } from '../theme';
import { Button } from '../ui/controls';
import { Sheet, SheetConfirm } from '../ui/Sheet';
import { ScheduleEditor } from './ScheduleEditor';

export interface ScheduleOpening { initial: 'actions' | 'list' | 'create'; draft: ScheduledMessageDraft; source: ScheduleSourceDraft; createDisabledReason: string | null }
export interface SchedulingContext { channelId: string; mode: DeliveryMode; canTts: boolean }
export interface ScheduledMessagesSheetProps { request: ScheduleOpening | null; context: SchedulingContext; canSend: boolean; attachments?: ReactNode; onAccepted(source: ScheduleSourceDraft | null): void; onClose(): void }

export function ScheduledMessagesSheet(props: ScheduledMessagesSheetProps) {
  const authorId = useSessionStore((state) => state.user?.id);
  const instance = useAgeRestrictedStore((state) => state.instance);
  const retained = useLastValue(props.request);
  const [opening, setOpening] = useState({ request: props.request, authorId, instance, version: 0 });
  if (opening.request !== props.request) setOpening({ request: props.request, authorId, instance, version: opening.version + (props.request ? 1 : 0) });
  const { onClose } = props;
  const ownerChanged = props.request !== null && (authorId !== opening.authorId || instance !== opening.instance);
  useEffect(() => { if (ownerChanged) onClose(); }, [ownerChanged, onClose]);
  return retained && authorId && !ownerChanged ? <Content key={`${authorId}:${props.context.channelId}:${opening.version}`} {...props} request={retained} visible={props.request !== null} authorId={authorId} /> : null;
}

function Content(props: Omit<ScheduledMessagesSheetProps, 'request'> & { request: ScheduleOpening; visible: boolean; authorId: string }) {
  const runtime = getRuntime();
  const locale = useSessionStore((state) => state.settings.locale);
  const { t } = createI18n(locale);
  const contentAllowed = useChannelContentAccess().canShow(props.context.channelId);
  const [manager] = useState(() => new ScheduledMessages({ api: runtime.api, storage: deviceStorage, instance: runtime.apiUrl, authorId: props.authorId, randomId: () => uuid.v4() }));
  const [editing, setEditing] = useState<'new' | ScheduledMessage | null>(props.request.initial === 'create' ? 'new' : null);
  const [actions, setActions] = useState(props.request.initial === 'actions');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<ScheduledMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const active = useAppActive();
  const list = useScheduledMessages(manager, props.context.channelId, props.visible && active && !actions && editing === null);
  const { onClose } = props;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  let pending = false;
  let journalError: string | null = null;
  try { pending = manager.pending(props.context.channelId) !== null; } catch (failure) { journalError = errorMessage(failure); }
  const complete = (item: ScheduledMessage, source: ScheduleSourceDraft | null) => {
    props.onAccepted(source); list.include(item.id); setEditing(null); setBusy(false); void list.refresh();
  };
  const cancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true); setError(null);
    try { const item = await manager.cancel(cancelling); if (alive.current) { list.include(item.id); setCancelling(null); void list.refresh(); } }
    catch (failure) {
      if (!alive.current) return;
      setError(`Could not cancel. ${errorMessage(failure)} Review the current status before trying again.`);
      try { await manager.detail(props.context.channelId, cancelling.id); } catch { /* The error and explicit Refresh action remain visible. */ }
      if (alive.current) setCancelling(null);
    } finally { if (alive.current) setBusy(false); }
  };
  const inspect = (item: ScheduledMessage) => {
    props.onClose();
    if (item.status === 'sent' && item.message_id) useReadNavStore.getState().requestJump(props.context.channelId, item.message_id);
  };
  return <Sheet visible={props.visible} onClose={close} title={actions ? 'Message actions' : editing === 'new' ? 'Send later' : editing ? 'Edit scheduled message' : 'Scheduled messages'} closeLabel="Close scheduled messages">
    {actions ? <><View>{contentAllowed && props.attachments}</View><View style={styles.list}><Button label={pending ? 'Confirm previous request' : 'Send later'} size="large" disabled={Boolean(props.request.createDisabledReason) && !pending} onPress={() => { setActions(false); setEditing('new'); }} />{props.request.createDisabledReason && !pending && <Text style={styles.help}>{props.request.createDisabledReason}</Text>}<Button label="Scheduled messages" size="large" onPress={() => setActions(false)} /></View></> : editing ? <ScheduleEditor key={editing === 'new' ? 'new' : editing.id} options={{ manager, channelId: props.context.channelId, mode: props.context.mode, canSend: props.canSend, canTts: props.context.canTts, draft: props.request.draft, source: props.request.source, active: props.visible && active, ...(editing === 'new' ? {} : { item: editing }), onComplete: complete }} onBack={() => setEditing(null)} onBusy={setBusy} /> : <View style={styles.list}>
      {!contentAllowed && <Text style={styles.help}>{t('age.scheduledHidden')}</Text>}
      <Text style={styles.help}>Only yours in this channel. Local time · {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
      <View style={styles.actions}><Button label={pending ? 'Confirm previous request' : 'Send later'} tone="primary" disabled={Boolean(props.request.createDisabledReason) && !pending} onPress={() => setEditing('new')} /><Button label="Refresh" disabled={list.busy} onPress={() => void list.refresh()} /></View>
      {props.request.createDisabledReason && !pending && <Text style={styles.help}>{props.request.createDisabledReason}</Text>}
      {(error || list.error || journalError) && <Text accessibilityRole="alert" style={styles.error}>{error ?? list.error ?? journalError}</Text>}
      {list.busy && list.items.length === 0 ? <Text accessibilityRole="text" style={styles.help}>Loading scheduled messages…</Text> : list.items.length === 0 && !list.error ? <View style={styles.empty}><Text accessibilityRole="header" style={styles.heading}>Nothing scheduled in this channel</Text><Text style={styles.help}>Write a text message, then choose Send later. Your scheduled messages appear here on your other devices too.</Text></View> : list.items.map((item) => {
        const status = scheduleStatus(item);
        return <View key={item.id} style={styles.item}>
          <Text accessibilityRole="header" style={[styles.heading, (item.status === 'delivery_unknown' || item.status === 'failed') && styles.error]}>{status.title}</Text>
          <Text style={styles.time}>{scheduleTimeLabel(item.scheduled_at)}</Text>
          {contentAllowed && item.message && <Text style={styles.message}>{item.message.content}</Text>}
          <Text style={styles.help}>{status.detail}</Text>
          {cancelling?.id === item.id ? <SheetConfirm body="Cancel this scheduled message?" confirmLabel="Cancel message" onConfirm={() => { if (!busy) void cancel(); }} onCancel={() => { if (!busy) setCancelling(null); }} /> : <View style={styles.actions}>
            {item.status === 'pending' && <><Button label="Edit" disabled={busy || !props.canSend || props.context.mode !== 'standard'} onPress={() => setEditing(item)} /><Button label="Cancel message" disabled={busy} onPress={() => setCancelling(item)} /></>}
            {(item.status === 'sent' || item.status === 'delivery_unknown') && <Button label={item.status === 'sent' ? 'View message' : 'Inspect channel'} onPress={() => inspect(item)} />}
          </View>}
        </View>;
      })}
      {list.next && <Button label="Load more" disabled={list.busy} onPress={() => void list.loadMore()} />}
    </View>}
  </Sheet>;
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space[5], paddingBottom: space[4], gap: space[4] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  item: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, paddingTop: space[4], gap: space[2] },
  heading: { color: theme.text, fontSize: type.body, fontWeight: '600' },
  time: { color: theme.muted, fontSize: type.meta, fontVariant: ['tabular-nums'] },
  help: { color: theme.muted, fontSize: type.ui, lineHeight: 21 },
  message: { color: theme.text, fontSize: type.body, lineHeight: 23 },
  error: { color: theme.danger, fontSize: type.ui },
  empty: { gap: space[2], paddingVertical: space[4] },
});
