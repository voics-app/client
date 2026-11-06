/** Reporting a message or a user (api#126): the categories, the draft, what the server receives and what the person is told. Shared by the desktop and the mobile report dialogs. */
import type { DeliveryMode } from '../contracts/rest';
import { brand } from './brandConfig';

export const REPORT_CATEGORIES = [
  { id: 'spam', label: 'Spam', hint: 'Scams, unwanted ads or repeated messages' },
  { id: 'harassment', label: 'Harassment or bullying', hint: 'Targeting, threatening or demeaning someone' },
  { id: 'hate_speech', label: 'Hate speech', hint: 'Attacks on people for who they are' },
  { id: 'violence', label: 'Violence or threats', hint: 'Threats or promoting harm' },
  { id: 'sexual_content', label: 'Sexual or explicit content', hint: 'Content that is not allowed in the place it was shared' },
  { id: 'self_harm', label: 'Self-harm', hint: 'Someone may be at risk of hurting themselves' },
  { id: 'illegal', label: 'Illegal content', hint: 'Content that breaks the law' },
  { id: 'impersonation', label: 'Impersonation', hint: 'Pretending to be someone else' },
  { id: 'other', label: 'Something else', hint: 'Anything that does not fit above' },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]['id'];

export const REPORT_NOTE_MAX = 500;
export const REPORT_CONTENT_MAX = 4000;

export type ReportTarget =
  | {
      kind: 'message';
      channelId: string;
      messageId: string;
      authorId: string;
      authorName: string;
      /** The text as this client shows it. Only sent for chats the server does not store, and only when the person agrees. */
      content: string;
      mode: DeliveryMode;
    }
  | { kind: 'user'; userId: string; userName: string };

export interface ReportDraft {
  category: ReportCategory | null;
  note: string;
  /** Ephemeral and P2P messages only: send the message text with the report. */
  includeContent: boolean;
}

export const emptyReportDraft = (): ReportDraft => ({ category: null, note: '', includeContent: true });

/** The JSON body of `POST /reports`. */
export interface CreateReportBody {
  target: 'message' | 'user';
  category: ReportCategory;
  note?: string;
  channel_id?: string;
  message_id?: string;
  user_id?: string;
  author_id?: string;
  content?: string;
}

export const reportCategoryLabel = (category: ReportCategory): string => REPORT_CATEGORIES.find((c) => c.id === category)?.label ?? category;

/** Whether the server holds a copy of the reported message (Standard chats). Ephemeral and P2P content only exists on the devices. */
export const serverHoldsCopy = (target: ReportTarget): boolean => target.kind === 'message' && target.mode === 'standard';

/** Whether the dialog offers to send the message text itself (a message the server does not store). */
export const canIncludeContent = (target: ReportTarget): boolean => target.kind === 'message' && target.mode !== 'standard' && target.content.trim().length > 0;

export function reportTitle(target: ReportTarget): string {
  return target.kind === 'message' ? 'Report message' : `Report ${target.userName}`;
}

/** What the person is told about the data this report shares, before sending. */
export function reportDisclosure(target: ReportTarget): string {
  if (target.kind === 'user') return `${brand().displayName} moderators will see your report and the account you reported. The person is not told who reported them.`;
  if (serverHoldsCopy(target)) return `${brand().displayName} moderators will see a copy of this message, who sent it and where. The person is not told who reported them.`;
  const kind = target.mode === 'p2p' ? 'peer-to-peer' : 'ephemeral';
  return `This is a ${kind} chat, so ${brand().displayName} keeps no copy of its messages. Moderators only receive what you send with this report. The person is not told who reported them.`;
}

export const REPORT_CONFIRMATION = {
  title: 'Report sent',
  body: 'Thank you. Our moderators will review it. You will not be told the outcome, and the person you reported is not told who reported them.',
} as const;

/** The first problem with a draft, or null when it can be sent. */
export function reportDraftError(draft: ReportDraft): string | null {
  if (!draft.category) return 'Choose what is wrong.';
  if (draft.note.trim().length > REPORT_NOTE_MAX) return `Keep the note under ${REPORT_NOTE_MAX} characters.`;
  return null;
}

export const canSubmitReport = (draft: ReportDraft): boolean => reportDraftError(draft) === null;

/** The request for a valid draft. Message text is sent only when the server has no copy and the person agreed. */
export function buildReportBody(target: ReportTarget, draft: ReportDraft): CreateReportBody {
  const error = reportDraftError(draft);
  if (error || !draft.category) throw new Error(error ?? 'Choose what is wrong.');
  const note = draft.note.trim();
  const base = { category: draft.category, ...(note ? { note } : {}) };
  if (target.kind === 'user') return { target: 'user', user_id: target.userId, ...base };
  const body: CreateReportBody = { target: 'message', channel_id: target.channelId, message_id: target.messageId, ...base };
  if (target.mode === 'standard') return body;
  body.author_id = target.authorId;
  if (draft.includeContent && canIncludeContent(target)) body.content = target.content.trim().slice(0, REPORT_CONTENT_MAX);
  return body;
}
