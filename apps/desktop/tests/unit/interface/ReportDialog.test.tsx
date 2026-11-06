// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import type { ReportTarget } from '@discordy/core/domain/reportModel';
import { ReportDialog } from '@renderer/interface/features/report/ReportDialog';

const createReport = vi.fn();
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { createReport } }) }));

const message = (mode: 'standard' | 'ephemeral' | 'p2p'): ReportTarget => ({ kind: 'message', channelId: 'c1', messageId: 'm1', authorId: 'u2', authorName: 'ann', content: 'what she wrote', mode });
const send = () => screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement;

beforeEach(() => {
  createReport.mockReset();
  useUiStore.setState({ dialog: { kind: 'report', target: message('standard') } } as never);
});
afterEach(cleanup);

describe('ReportDialog', () => {
  it('needs a category before it can be sent', () => {
    render(<ReportDialog target={message('standard')} />);
    expect(send().disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Harassment/ }));
    expect(send().disabled).toBe(false);
  });

  it('sends ids only for a stored message and then confirms', async () => {
    createReport.mockResolvedValue(undefined);
    render(<ReportDialog target={message('standard')} />);
    expect(screen.getByText(/copy of this message/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Spam/ }));
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: ' posts links ' } });
    fireEvent.click(send());
    expect(await screen.findByText('Report sent')).toBeTruthy();
    expect(createReport).toHaveBeenCalledWith({ target: 'message', channel_id: 'c1', message_id: 'm1', category: 'spam', note: 'posts links' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useUiStore.getState().dialog).toBeNull();
  });

  it('says an ephemeral chat has no server copy and lets the person withhold the text', async () => {
    createReport.mockResolvedValue(undefined);
    render(<ReportDialog target={message('ephemeral')} />);
    expect(screen.getByText(/ephemeral chat.*keeps no copy/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Hate speech/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Send the text/ }));
    fireEvent.click(send());
    await waitFor(() => expect(createReport).toHaveBeenCalled());
    expect(createReport.mock.calls[0]![0]).toEqual({ target: 'message', channel_id: 'c1', message_id: 'm1', category: 'hate_speech', author_id: 'u2' });
  });

  it('sends the text of a p2p message by default', async () => {
    createReport.mockResolvedValue(undefined);
    render(<ReportDialog target={message('p2p')} />);
    expect(screen.getByText(/peer-to-peer chat/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Violence/ }));
    fireEvent.click(send());
    await waitFor(() => expect(createReport).toHaveBeenCalled());
    expect(createReport.mock.calls[0]![0]).toMatchObject({ author_id: 'u2', content: 'what she wrote' });
  });

  it('reports a user', async () => {
    createReport.mockResolvedValue(undefined);
    render(<ReportDialog target={{ kind: 'user', userId: 'u9', userName: 'eve' }} />);
    expect(screen.getByRole('dialog', { name: 'Report eve' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Impersonation/ }));
    fireEvent.click(send());
    await waitFor(() => expect(createReport).toHaveBeenCalledWith({ target: 'user', user_id: 'u9', category: 'impersonation' }));
  });

  it('shows the failure and keeps the draft so it can be retried', async () => {
    createReport.mockRejectedValueOnce(new ApiError(429, 0, 'slow')).mockResolvedValueOnce(undefined);
    render(<ReportDialog target={message('standard')} />);
    fireEvent.click(screen.getByRole('radio', { name: /Spam/ }));
    fireEvent.click(send());
    expect((await screen.findByRole('alert')).textContent).toMatch(/lot of reports/);
    expect((screen.getByRole('radio', { name: /Spam/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(send());
    expect(await screen.findByText('Report sent')).toBeTruthy();
  });
});
