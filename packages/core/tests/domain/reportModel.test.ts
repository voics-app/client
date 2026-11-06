import { describe, expect, it } from 'vitest';
import {
  REPORT_CATEGORIES,
  REPORT_CONTENT_MAX,
  REPORT_NOTE_MAX,
  buildReportBody,
  canIncludeContent,
  canSubmitReport,
  emptyReportDraft,
  reportDisclosure,
  reportDraftError,
  reportTitle,
  serverHoldsCopy,
  type ReportTarget,
} from '@discordy/core/domain/reportModel';

const message = (over: Partial<Extract<ReportTarget, { kind: 'message' }>> = {}): ReportTarget => ({
  kind: 'message',
  channelId: 'c1',
  messageId: 'm1',
  authorId: 'u2',
  authorName: 'ann',
  content: 'hello there',
  mode: 'standard',
  ...over,
});
const user: ReportTarget = { kind: 'user', userId: 'u2', userName: 'ann' };
const draft = (over = {}) => ({ ...emptyReportDraft(), category: 'spam' as const, ...over });

describe('report categories', () => {
  it('matches the categories the api accepts', () => {
    expect(REPORT_CATEGORIES.map((c) => c.id)).toEqual(['spam', 'harassment', 'hate_speech', 'violence', 'sexual_content', 'self_harm', 'illegal', 'impersonation', 'other']);
  });
});

describe('draft validation', () => {
  it('needs a category and a short note', () => {
    expect(reportDraftError(emptyReportDraft())).toBe('Choose what is wrong.');
    expect(canSubmitReport(draft())).toBe(true);
    expect(canSubmitReport(draft({ note: 'x'.repeat(REPORT_NOTE_MAX) }))).toBe(true);
    expect(reportDraftError(draft({ note: 'x'.repeat(REPORT_NOTE_MAX + 1) }))).toMatch(/under 500/);
  });

  it('counts the trimmed note', () => {
    expect(canSubmitReport(draft({ note: `${' '.repeat(50)}${'x'.repeat(REPORT_NOTE_MAX)}` }))).toBe(true);
  });
});

describe('report body', () => {
  it('sends only ids for a stored message, never the text', () => {
    expect(buildReportBody(message(), draft({ note: ' rude ' }))).toEqual({ target: 'message', channel_id: 'c1', message_id: 'm1', category: 'spam', note: 'rude' });
  });

  it('omits an empty note', () => {
    expect(buildReportBody(message(), draft({ note: '  ' }))).not.toHaveProperty('note');
  });

  it('sends the author and, when agreed, the text for an ephemeral message', () => {
    const body = buildReportBody(message({ mode: 'ephemeral' }), draft({ includeContent: true }));
    expect(body).toMatchObject({ target: 'message', author_id: 'u2', content: 'hello there' });
  });

  it('keeps the text back when the person declines', () => {
    const body = buildReportBody(message({ mode: 'p2p' }), draft({ includeContent: false }));
    expect(body.author_id).toBe('u2');
    expect(body).not.toHaveProperty('content');
  });

  it('caps the submitted text', () => {
    const body = buildReportBody(message({ mode: 'p2p', content: 'y'.repeat(REPORT_CONTENT_MAX + 50) }), draft());
    expect(body.content).toHaveLength(REPORT_CONTENT_MAX);
  });

  it('builds a user report', () => {
    expect(buildReportBody(user, draft({ category: 'impersonation' }))).toEqual({ target: 'user', user_id: 'u2', category: 'impersonation' });
  });

  it('refuses an invalid draft', () => {
    expect(() => buildReportBody(user, emptyReportDraft())).toThrow('Choose what is wrong.');
  });
});

describe('what the person is told', () => {
  it('says the server has a copy only for stored chats', () => {
    expect(serverHoldsCopy(message())).toBe(true);
    expect(serverHoldsCopy(message({ mode: 'ephemeral' }))).toBe(false);
    expect(serverHoldsCopy(user)).toBe(false);
  });

  it('discloses that ephemeral and p2p chats have no server copy', () => {
    expect(reportDisclosure(message())).toMatch(/copy of this message/);
    expect(reportDisclosure(message({ mode: 'ephemeral' }))).toMatch(/ephemeral chat.*keeps no copy.*only receive what you send/);
    expect(reportDisclosure(message({ mode: 'p2p' }))).toMatch(/peer-to-peer chat/);
    expect(reportDisclosure(user)).toMatch(/not told who reported/);
  });

  it('offers to include text only for unstored messages that have text', () => {
    expect(canIncludeContent(message())).toBe(false);
    expect(canIncludeContent(message({ mode: 'ephemeral' }))).toBe(true);
    expect(canIncludeContent(message({ mode: 'ephemeral', content: '  ' }))).toBe(false);
    expect(canIncludeContent(user)).toBe(false);
  });

  it('titles the dialog', () => {
    expect(reportTitle(message())).toBe('Report message');
    expect(reportTitle(user)).toBe('Report ann');
  });
});
