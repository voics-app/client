import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { deviceStorage } from '@discordy/core/application/ports/deviceStorage';
import type { ScheduleSourceDraft } from '@discordy/core/application/scheduledCreateJournal';
import { ScheduledMessages } from '@discordy/core/application/scheduledMessages';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import type { ScheduledMessage, ScheduledMessageDraft } from '@discordy/core/contracts/scheduledMessages';
import { scheduleStatus, scheduleTimeLabel } from '@discordy/core/domain/scheduledMessages';
import { useScheduledMessages } from '@discordy/react/useScheduledMessages';
import { useConnectionStore } from '../../app/connectionStore';
import { openChannel } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { ScheduleEditor } from './ScheduleEditor';
import './scheduling.css';

export interface ScheduledMessagesDialogProps {
  channelId: string;
  mode: DeliveryMode;
  initial: 'list' | 'create';
  draft: ScheduledMessageDraft;
  source: ScheduleSourceDraft;
  createDisabledReason: string | null;
  canSend: boolean;
  canTts: boolean;
  onAccepted(source: ScheduleSourceDraft | null): void;
  onClose(): void;
}

export function ScheduledMessagesDialog(props: ScheduledMessagesDialogProps) {
  const authorId = useSessionStore((state) => state.user?.id);
  const instance = useConnectionStore((state) => state.apiUrl);
  const [owner] = useState({ authorId, instance });
  const { onClose } = props;
  const ownerChanged = authorId !== owner.authorId || instance !== owner.instance;
  useEffect(() => { if (ownerChanged) onClose(); }, [ownerChanged, onClose]);
  return authorId && !ownerChanged ? <Content key={`${instance}:${authorId}:${props.channelId}`} {...props} authorId={authorId} instance={instance} /> : null;
}

function Content(props: ScheduledMessagesDialogProps & { authorId: string; instance: string }) {
  const [manager] = useState(() => new ScheduledMessages({ api: getRuntime().api, storage: deviceStorage, instance: props.instance, authorId: props.authorId, randomId: () => crypto.randomUUID() }));
  const [foreground, setForeground] = useState(() => document.visibilityState !== 'hidden');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<'new' | ScheduledMessage | null>(props.initial === 'create' ? 'new' : null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<ScheduledMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const list = useScheduledMessages(manager, props.channelId, foreground && editing === null);
  const { refresh } = list;
  const { onClose } = props;
  const closeState = useRef({ busy, onClose });
  closeState.current = { busy, onClose };
  useEffect(() => {
    const update = () => setForeground(document.visibilityState !== 'hidden');
    const focus = () => { setForeground(true); setRefreshKey((value) => value + 1); if (!editing) void refresh(); };
    document.addEventListener('visibilitychange', update); window.addEventListener('focus', focus);
    return () => { document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', focus); };
  }, [refresh, editing]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const close = useCallback(() => { if (!closeState.current.busy) closeState.current.onClose(); }, []);
  let pending = false;
  let journalError: string | null = null;
  try { pending = manager.pending(props.channelId) !== null; } catch (failure) { journalError = errorMessage(failure); }
  const complete = (item: ScheduledMessage, source: ScheduleSourceDraft | null) => {
    props.onAccepted(source); list.include(item.id); setEditing(null); setBusy(false);
    useUiStore.getState().toast({ tone: item.status === 'failed' || item.status === 'delivery_unknown' ? 'warning' : 'success', title: scheduleStatus(item).title });
    void list.refresh();
  };
  const cancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true); setError(null);
    try { const item = await manager.cancel(cancelling); if (alive.current) { list.include(item.id); setCancelling(null); void list.refresh(); } }
    catch (failure) {
      if (!alive.current) return;
      setError(`Could not cancel. ${errorMessage(failure)} Review the current status before trying again.`);
      try { await manager.detail(props.channelId, cancelling.id); } catch { /* The original error and a manual refresh remain visible. */ }
      if (alive.current) setCancelling(null);
    } finally { if (alive.current) setBusy(false); }
  };
  const inspect = (item: ScheduledMessage) => {
    props.onClose(); openChannel(props.channelId);
    if (item.status === 'sent' && item.message_id) useReadNavStore.getState().requestJump(props.channelId, item.message_id);
  };
  return <Modal open onClose={close} width={560} title={editing === 'new' ? 'Send later' : editing ? 'Edit scheduled message' : 'Scheduled messages'} description={editing ? undefined : `Only yours in this channel. Local time · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}>
    {editing ? <ScheduleEditor key={editing === 'new' ? 'new' : editing.id} options={{ manager, channelId: props.channelId, mode: props.mode, canSend: props.canSend, canTts: props.canTts, draft: props.draft, source: props.source, active: foreground, refreshKey, ...(editing === 'new' ? {} : { item: editing }), onComplete: complete }} onBack={() => setEditing(null)} onBusy={setBusy} /> : <div className="schedule-list-view">
      <div className="schedule-toolbar"><Button size="sm" variant="primary" disabled={Boolean(props.createDisabledReason) && !pending} title={props.createDisabledReason ?? undefined} onClick={() => setEditing('new')}>{pending ? 'Confirm previous request' : 'Send later'}</Button><Button size="sm" disabled={list.busy} onClick={() => void list.refresh()}>Refresh</Button></div>
      {props.createDisabledReason && !pending && <p className="field-hint">{props.createDisabledReason}</p>}
      {(error || list.error || journalError) && <p className="field-error" role="alert">{error ?? list.error ?? journalError}</p>}
      {list.busy && list.items.length === 0 ? <p role="status">Loading scheduled messages…</p> : list.items.length === 0 && !list.error ? <div className="schedule-empty"><h3>Nothing scheduled in this channel</h3><p>Write a text message, then choose Send later. Your scheduled messages appear here on your other devices too.</p></div> : <ul className="schedule-list" aria-label="Your scheduled messages">{list.items.map((item) => {
        const status = scheduleStatus(item);
        return <li key={item.id} className="schedule-item">
          <div className="schedule-heading"><h3 data-status={item.status}>{status.title}</h3><time dateTime={item.scheduled_at}>{scheduleTimeLabel(item.scheduled_at)}</time></div>
          {item.message && <p className="schedule-message">{item.message.content}</p>}
          <p className="field-hint">{status.detail}</p>
          {cancelling?.id === item.id ? <div className="schedule-cancel" role="group" aria-label="Confirm cancellation"><p>Cancel this scheduled message?</p><Button size="sm" disabled={busy} onClick={() => setCancelling(null)}>Keep scheduled</Button><Button size="sm" variant="danger" loading={busy} onClick={() => void cancel()}>Cancel message</Button></div> : <div className="row">
            {item.status === 'pending' && <><Button size="sm" disabled={busy || !props.canSend || props.mode !== 'standard'} onClick={() => setEditing(item)}>Edit</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setCancelling(item)}>Cancel message</Button></>}
            {(item.status === 'sent' || item.status === 'delivery_unknown') && <Button size="sm" variant="ghost" onClick={() => inspect(item)}>{item.status === 'sent' ? 'View message' : 'Inspect channel'}</Button>}
          </div>}
        </li>;
      })}</ul>}
      {list.next && <Button disabled={list.busy} onClick={() => void list.loadMore()}>Load more</Button>}
    </div>}
  </Modal>;
}
