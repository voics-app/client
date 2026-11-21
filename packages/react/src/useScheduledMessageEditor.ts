import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { errorMessage } from '@discordy/core/application/errorMessage';
import type { SavedScheduleCreate, ScheduleSourceDraft } from '@discordy/core/application/scheduledCreateJournal';
import type { ScheduledMessages } from '@discordy/core/application/scheduledMessages';
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import type { ScheduledMessage, ScheduledMessageDraft } from '@discordy/core/contracts/scheduledMessages';
import { localScheduleInput, localScheduleInstant, nextScheduleTime, scheduleDraftError, scheduleTimeError } from '@discordy/core/domain/scheduledMessages';

export interface ScheduleEditorOptions {
  manager: ScheduledMessages;
  channelId: string;
  mode: DeliveryMode;
  canSend: boolean;
  canTts: boolean;
  draft: ScheduledMessageDraft;
  source: ScheduleSourceDraft | null;
  item?: ScheduledMessage;
  active?: boolean;
  refreshKey?: number;
  onComplete(item: ScheduledMessage, source: ScheduleSourceDraft | null): void;
}

const normalized = (draft: ScheduledMessageDraft): ScheduledMessageDraft => ({ content: draft.content, tts: draft.tts ?? false, reply_to: draft.reply_to ?? null, replied_user: draft.replied_user ?? true, silent: draft.silent ?? false });

/** Shared form state keeps conflict review and retry identity identical on desktop and native. */
export function useScheduledMessageEditor(options: ScheduleEditorOptions) {
  const { manager, channelId, mode, canSend, canTts } = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  const records = useSyncExternalStore(manager.subscribe, manager.snapshot, manager.snapshot);
  const [initial] = useState(() => {
    try { return { pending: options.item ? null : manager.pending(channelId), error: null }; }
    catch (error) { return { pending: null, error: errorMessage(error) }; }
  });
  const [pending, setPending] = useState<SavedScheduleCreate | null>(initial.pending);
  const [baseline, setBaseline] = useState(options.item);
  const [message, setMessage] = useState(() => normalized(initial.pending?.request.message ?? options.item?.message ?? options.draft));
  const [localTime, setLocalTime] = useState(() => initial.pending ? localScheduleInput(initial.pending.request.scheduled_at) : options.item ? localScheduleInput(options.item.scheduled_at) : nextScheduleTime());
  const [error, setError] = useState<string | null>(initial.error);
  const [conflict, setConflict] = useState<ScheduledMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const baselineId = baseline?.id;
  useEffect(() => {
    if (!baselineId || options.active === false) return;
    let current = true;
    const refresh = () => { void manager.detail(channelId, baselineId).catch(() => { if (current) setError('Could not refresh the current status. Saving still checks for changes on the server.'); }); };
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => { current = false; clearInterval(timer); };
  }, [manager, channelId, baselineId, options.active, options.refreshKey]);
  const latest = baselineId ? records[baselineId] : undefined;
  useEffect(() => {
    if (baseline && latest && latest.revision > baseline.revision) {
      setConflict(latest);
      setError('This schedule changed on another device or started sending. Your edits are still here. Review the latest version before saving.');
    }
  }, [baseline, latest]);

  const timeChanged = !baseline || localTime !== localScheduleInput(baseline.scheduled_at);
  const instant = pending?.request.scheduled_at ?? (!timeChanged && baseline ? baseline.scheduled_at : localScheduleInstant(localTime));
  const messageChanged = !baseline || JSON.stringify(message) !== JSON.stringify(normalized(baseline.message ?? options.draft));
  const validation = pending ? initial.error : initial.error
    ?? (mode !== 'standard' ? 'Scheduled messages are available only in Standard chats.' : null)
    ?? (!canSend ? 'You do not have permission to send messages here.' : null)
    ?? (message.tts && !canTts ? 'You do not have permission to send text-to-speech messages here.' : null)
    ?? (baseline && baseline.status !== 'pending' ? 'This scheduled message can no longer be edited.' : null)
    ?? scheduleDraftError(message)
    ?? (timeChanged ? instant ? scheduleTimeError(instant) : 'Choose a valid local date and time. That time may be skipped by a clock change.' : null);

  const save = async () => {
    if (running.current || validation || conflict || !instant || (baseline && !timeChanged && !messageChanged)) return;
    running.current = true; setBusy(true); setError(null);
    try {
      if (baseline) {
        const item = await manager.edit(baseline, { ...(timeChanged ? { scheduled_at: instant } : {}), ...(messageChanged ? { message } : {}) });
        if (alive.current) callbacks.current.onComplete(item, null);
      } else {
        if (!pending) manager.prepare(channelId, mode, instant, message, options.source);
        const receipt = await manager.confirm(channelId, mode);
        if (alive.current) callbacks.current.onComplete(receipt.item, receipt.source);
      }
    } catch (failure) {
      if (!alive.current) return;
      setError(errorMessage(failure));
      if (baseline && failure && typeof failure === 'object' && 'status' in failure && failure.status === 409) {
        try {
          const latest = await manager.detail(channelId, baseline.id);
          if (alive.current) { setConflict(latest); setError('This schedule changed on another device or started sending. Your edits are still here. Review the latest version before saving.'); }
        } catch { if (alive.current) setError('This schedule changed. Could not load the latest version yet; try saving again to refresh it.'); }
      }
    } finally {
      running.current = false;
      if (alive.current) {
        setBusy(false);
        if (!baseline) {
          try { setPending(manager.pending(channelId)); }
          catch (failure) { setError(errorMessage(failure)); }
        }
      }
    }
  };
  const useLatest = () => {
    if (!conflict?.message || conflict.status !== 'pending') return;
    setBaseline(conflict); setMessage(normalized(conflict.message)); setLocalTime(localScheduleInput(conflict.scheduled_at)); setConflict(null); setError(null);
  };
  return {
    message, setMessage, localTime, setLocalTime, instant, validation, error, busy, pending, conflict, useLatest,
    isEditing: Boolean(baseline), fieldsDisabled: busy || pending !== null || conflict !== null,
    canSave: !busy && !validation && !conflict && (pending !== null || !baseline || timeChanged || messageChanged),
    save,
  };
}
