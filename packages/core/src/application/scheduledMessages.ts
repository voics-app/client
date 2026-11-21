import type { DeliveryMode } from '../contracts/rest';
import type { EditScheduledMessage, ScheduledMessage, ScheduledMessageDraft } from '../contracts/scheduledMessages';
import { newerSchedule, scheduleDraftError, scheduleTimeError } from '../domain/scheduledMessages';
import type { ApiPort } from './ports/api';
import type { KeyValueStorage } from './ports/deviceStorage';
import { ScheduledCreateJournal, type SavedScheduleCreate, type ScheduleSourceDraft } from './scheduledCreateJournal';

export type SchedulingApi = Pick<ApiPort, 'createScheduledMessage' | 'scheduledMessages' | 'scheduledMessage' | 'editScheduledMessage' | 'cancelScheduledMessage'>;

interface Options {
  api: SchedulingApi;
  storage: KeyValueStorage;
  instance: string;
  authorId: string;
  randomId(): string;
}

/** One signed-in account and endpoint. Cached revisions never move backwards. */
export class ScheduledMessages {
  private readonly journal: ScheduledCreateJournal;
  private records: Readonly<Record<string, ScheduledMessage>> = {};
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: Options) {
    this.journal = new ScheduledCreateJournal(options.storage, options);
  }

  snapshot = (): Readonly<Record<string, ScheduledMessage>> => this.records;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  pending(channelId: string): SavedScheduleCreate | null { return this.journal.read(channelId); }

  prepare(channelId: string, mode: DeliveryMode, scheduledAt: string, message: ScheduledMessageDraft, source: ScheduleSourceDraft | null = null): void {
    if (mode !== 'standard') throw new Error('Scheduled messages are available only in Standard chats.');
    const error = scheduleDraftError(message) ?? scheduleTimeError(scheduledAt);
    if (error) throw new Error(error);
    this.journal.write(channelId, { request: { request_id: this.options.randomId(), scheduled_at: scheduledAt, message }, source });
    this.publish();
  }

  /** In a now-private chat, only inspect the existing ID; never upload its old plaintext again. */
  async confirm(channelId: string, mode: DeliveryMode): Promise<{ item: ScheduledMessage; source: ScheduleSourceDraft | null }> {
    const saved = this.pending(channelId);
    if (!saved) throw new Error('There is no scheduling request waiting for confirmation.');
    let item: ScheduledMessage;
    try {
      item = mode === 'standard'
        ? await this.options.api.createScheduledMessage(channelId, saved.request)
        : await this.options.api.scheduledMessage(channelId, saved.request.request_id);
    } catch (error) {
      // A definite rejection permits the user to correct the draft. Unavailable/lost replies retain the exact body.
      if (mode === 'standard' && rejectedCreation(error)) { this.journal.clear(channelId, saved.request.request_id); this.publish(); }
      throw error;
    }
    if (item.id !== saved.request.request_id) throw new Error('The scheduling response did not match the saved request.');
    const current = this.remember(channelId, item);
    this.journal.clear(channelId, saved.request.request_id);
    this.publish();
    return { item: current, source: saved.source };
  }

  async page(channelId: string, after?: string) {
    const page = await this.options.api.scheduledMessages(channelId, { limit: 50, ...(after ? { after } : {}) });
    return { items: page.items.map((item) => this.remember(channelId, item)), next_after: page.next_after };
  }

  async detail(channelId: string, scheduleId: string): Promise<ScheduledMessage> {
    return this.remember(channelId, await this.options.api.scheduledMessage(channelId, scheduleId));
  }

  async edit(item: ScheduledMessage, replacement: Omit<EditScheduledMessage, 'expected_revision'>): Promise<ScheduledMessage> {
    return this.remember(item.channel_id, await this.options.api.editScheduledMessage(item.channel_id, item.id, { expected_revision: item.revision, ...replacement }));
  }

  async cancel(item: ScheduledMessage): Promise<ScheduledMessage> {
    return this.remember(item.channel_id, await this.options.api.cancelScheduledMessage(item.channel_id, item.id, item.revision));
  }

  private remember(channelId: string, item: ScheduledMessage): ScheduledMessage {
    if (item.author_id !== this.options.authorId || item.channel_id !== channelId || (this.records[item.id] && this.records[item.id]?.channel_id !== channelId) || !Number.isInteger(item.revision) || item.revision < 1 || item.revision > 2147483647) throw new Error('The scheduling response did not match this account and channel.');
    const current = newerSchedule(this.records[item.id], item);
    if (current !== this.records[item.id]) { this.records = { ...this.records, [item.id]: current }; this.publish(); }
    return current;
  }

  private publish(): void {
    this.records = { ...this.records };
    for (const listener of this.listeners) listener();
  }
}

function rejectedCreation(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  return [400, 403, 404, 405, 409, 422].includes(Number(error.status));
}
