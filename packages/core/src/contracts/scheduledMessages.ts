/** Author-private scheduling DTOs, pinned to contracts #50 / ADR 0028. */
export interface ScheduledMessageDraft {
  content: string;
  tts?: boolean;
  reply_to?: string | null;
  replied_user?: boolean;
  silent?: boolean;
}

export type ScheduledMessageStatus = 'pending' | 'dispatching' | 'sent' | 'failed' | 'cancelled' | 'delivery_unknown';
export type ScheduledMessageFailure = 'access_denied' | 'channel_missing' | 'delivery_mode_changed' | 'invalid_message' | 'dependency_unavailable' | 'delivery_unknown';

export interface ScheduledMessage {
  id: string;
  channel_id: string;
  author_id: string;
  revision: number;
  status: ScheduledMessageStatus;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
  message: ScheduledMessageDraft | null;
  message_id: string | null;
  failure: ScheduledMessageFailure | null;
}

export interface CreateScheduledMessage {
  request_id: string;
  scheduled_at: string;
  message: ScheduledMessageDraft;
}

export interface EditScheduledMessage {
  expected_revision: number;
  scheduled_at?: string;
  message?: ScheduledMessageDraft;
}

export interface ScheduledMessagePage { items: ScheduledMessage[]; next_after: string | null }
