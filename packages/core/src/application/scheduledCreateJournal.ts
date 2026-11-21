import type { CreateScheduledMessage } from '../contracts/scheduledMessages';
import type { KeyValueStorage } from './ports/deviceStorage';

export interface ScheduleSourceDraft { text: string; replyTo: string | null }
export interface SavedScheduleCreate { request: CreateScheduledMessage; source: ScheduleSourceDraft | null }

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The original body is durable before POST; it survives response loss and app restarts. */
export class ScheduledCreateJournal {
  constructor(private readonly storage: KeyValueStorage, private readonly scope: { instance: string; authorId: string }) {}

  read(channelId: string): SavedScheduleCreate | null {
    const serialized = this.storage.getItem(this.key(channelId));
    if (serialized === null) return null;
    let value: unknown;
    try { value = JSON.parse(serialized); } catch { throw new Error('The saved scheduling request could not be read. It has been preserved.'); }
    if (!validSavedRequest(value)) throw new Error('The saved scheduling request is invalid. It has been preserved.');
    return value;
  }

  write(channelId: string, value: SavedScheduleCreate): void {
    if (this.read(channelId)) throw new Error('Confirm the previous scheduling request before creating another.');
    if (!validSavedRequest(value)) throw new Error('Could not create a valid scheduling request.');
    this.storage.setItem(this.key(channelId), JSON.stringify(value));
  }

  clear(channelId: string, requestId: string): void {
    if (this.read(channelId)?.request.request_id === requestId) this.storage.removeItem(this.key(channelId));
  }

  private key(channelId: string): string {
    return `voics.schedule-create:${encodeURIComponent(this.scope.instance.replace(/\/+$/, ''))}:${this.scope.authorId}:${channelId}`;
  }
}

function validSavedRequest(value: unknown): value is SavedScheduleCreate {
  if (!value || typeof value !== 'object') return false;
  const { request, source } = value as SavedScheduleCreate;
  if (!request || typeof request !== 'object' || typeof request.request_id !== 'string' || !UUID_V4.test(request.request_id) || typeof request.scheduled_at !== 'string' || !Number.isFinite(Date.parse(request.scheduled_at))) return false;
  if (Object.keys(request).some((key) => !['request_id', 'scheduled_at', 'message'].includes(key))) return false;
  const draft = request.message;
  if (!draft || typeof draft.content !== 'string' || !draft.content.trim() || [...draft.content].length > 2000) return false;
  if (Object.keys(draft).some((key) => !['content', 'tts', 'reply_to', 'replied_user', 'silent'].includes(key))) return false;
  if ([draft.tts, draft.replied_user, draft.silent].some((flag) => flag !== undefined && typeof flag !== 'boolean')) return false;
  if (draft.reply_to != null && (typeof draft.reply_to !== 'string' || !/^[1-9]\d*$/.test(draft.reply_to))) return false;
  return source === null || (typeof source === 'object' && typeof source.text === 'string' && (source.replyTo === null || typeof source.replyTo === 'string'));
}
