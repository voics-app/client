import { describe, expect, it, vi } from 'vitest';
import { reportFailureMessage, submitReport } from '@discordy/core/application/reportCommands';
import { emptyReportDraft, type ReportTarget } from '@discordy/core/domain/reportModel';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';

const target: ReportTarget = { kind: 'message', channelId: 'c1', messageId: 'm1', authorId: 'u2', authorName: 'ann', content: 'hi', mode: 'standard' };
const draft = { ...emptyReportDraft(), category: 'harassment' as const };

describe('submitReport', () => {
  it('posts the built body', async () => {
    const createReport = vi.fn().mockResolvedValue(undefined);
    expect(await submitReport({ createReport }, target, draft)).toEqual({ ok: true });
    expect(createReport).toHaveBeenCalledWith({ target: 'message', channel_id: 'c1', message_id: 'm1', category: 'harassment' });
  });

  it('does not call the api for an invalid draft', async () => {
    const createReport = vi.fn();
    expect(await submitReport({ createReport }, target, emptyReportDraft())).toEqual({ ok: false, message: 'Choose what is wrong.' });
    expect(createReport).not.toHaveBeenCalled();
  });

  it('reports a failure without throwing', async () => {
    const createReport = vi.fn().mockRejectedValue(new ApiError(0, 0, 'fetch failed'));
    expect(await submitReport({ createReport }, target, draft)).toEqual({ ok: false, message: 'You appear to be offline.' });
  });
});

describe('reportFailureMessage', () => {
  it('words the rate limit, a missing target and lost access', () => {
    expect(reportFailureMessage(new ApiError(429, 0, 'slow down'))).toMatch(/lot of reports/);
    expect(reportFailureMessage(new ApiError(404, 10008, 'Unknown Message'))).toMatch(/no longer exists/);
    expect(reportFailureMessage(new ApiError(403, 50001, 'Missing Access'))).toMatch(/no longer see/);
  });

  it('falls back to the shared error text', () => {
    expect(reportFailureMessage(new ApiError(400, 50035, 'Invalid form body'))).toBe('Invalid form body');
    expect(reportFailureMessage(new Error('boom'))).toBe('boom');
  });
});
