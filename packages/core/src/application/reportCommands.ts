/** Sending a report, shared by the desktop and the mobile report dialogs. */
import type { ApiPort } from './ports/api';
import { ApiError } from '../infrastructure/http/httpClient';
import { buildReportBody, reportDraftError, type ReportDraft, type ReportTarget } from '../domain/reportModel';
import { errorMessage } from './errorMessage';

export type ReportOutcome = { ok: true } | { ok: false; message: string };

/** Why a report failed, in words for the dialog. A deleted message and the hourly limit get their own text. */
export function reportFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'You have sent a lot of reports. Try again in a while.';
    if (error.status === 404) return 'That message or account no longer exists.';
    if (error.status === 403) return 'You can no longer see this, so it cannot be reported.';
  }
  return errorMessage(error);
}

/** Validates the draft and sends it. Never throws: the dialog shows `message` on failure and keeps the draft. */
export async function submitReport(api: Pick<ApiPort, 'createReport'>, target: ReportTarget, draft: ReportDraft): Promise<ReportOutcome> {
  const problem = reportDraftError(draft);
  if (problem) return { ok: false, message: problem };
  try {
    await api.createReport(buildReportBody(target, draft));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: reportFailureMessage(error) };
  }
}
