import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import type { ReportTarget } from '@discordy/core/domain/reportModel';
import '../../src/brand';
import { ReportSheet } from '../../src/report/ReportSheet';

const mockCreateReport = jest.fn();
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ api: { createReport: mockCreateReport } }) }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const message = (mode: 'standard' | 'ephemeral' | 'p2p'): ReportTarget => ({ kind: 'message', channelId: 'c1', messageId: 'm1', authorId: 'u2', authorName: 'ann', content: 'what she wrote', mode });
const sheet = (target: ReportTarget | null, onClose = jest.fn()) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ReportSheet target={target} onClose={onClose} />
  </SafeAreaProvider>
);
const send = () => screen.getByLabelText('Send report');

beforeEach(() => mockCreateReport.mockReset());

describe('ReportSheet', () => {
  it('stays closed without a target', async () => {
    await render(sheet(null));
    expect(screen.queryByText('Report message')).toBeNull();
  });

  it('needs a category before it can be sent', async () => {
    await render(sheet(message('standard')));
    expect(send().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Harassment or bullying'));
    expect(send().props.accessibilityState.disabled).toBe(false);
  });

  it('sends ids only for a stored message, then confirms', async () => {
    mockCreateReport.mockResolvedValue(undefined);
    const onClose = jest.fn();
    await render(sheet(message('standard'), onClose));
    expect(screen.getByText(/copy of this message/)).toBeTruthy();
    expect(screen.queryByLabelText('Send the text of this message with the report')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Spam'));
    await fireEvent.changeText(screen.getByLabelText('Note (optional)'), ' posts links ');
    await fireEvent.press(send());
    expect(await screen.findByText('Report sent')).toBeTruthy();
    expect(mockCreateReport).toHaveBeenCalledWith({ target: 'message', channel_id: 'c1', message_id: 'm1', category: 'spam', note: 'posts links' });
    await fireEvent.press(screen.getByLabelText('Done'));
    expect(onClose).toHaveBeenCalled();
  });

  it('says an ephemeral chat has no server copy and lets the person withhold the text', async () => {
    mockCreateReport.mockResolvedValue(undefined);
    await render(sheet(message('ephemeral')));
    expect(screen.getByText(/ephemeral chat.*keeps no copy/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Hate speech'));
    await fireEvent.press(screen.getByLabelText('Send the text of this message with the report'));
    await fireEvent.press(send());
    await waitFor(() => expect(mockCreateReport).toHaveBeenCalled());
    expect(mockCreateReport.mock.calls[0][0]).toEqual({ target: 'message', channel_id: 'c1', message_id: 'm1', category: 'hate_speech', author_id: 'u2' });
  });

  it('sends the text of a p2p message by default', async () => {
    mockCreateReport.mockResolvedValue(undefined);
    await render(sheet(message('p2p')));
    await fireEvent.press(screen.getByLabelText('Violence or threats'));
    await fireEvent.press(send());
    await waitFor(() => expect(mockCreateReport).toHaveBeenCalled());
    expect(mockCreateReport.mock.calls[0][0]).toMatchObject({ author_id: 'u2', content: 'what she wrote' });
  });

  it('reports a user', async () => {
    mockCreateReport.mockResolvedValue(undefined);
    await render(sheet({ kind: 'user', userId: 'u9', userName: 'eve' }));
    expect(screen.getByText('Report eve')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Impersonation'));
    await fireEvent.press(send());
    await waitFor(() => expect(mockCreateReport).toHaveBeenCalledWith({ target: 'user', user_id: 'u9', category: 'impersonation' }));
  });

  it('shows the failure and keeps the draft so it can be retried', async () => {
    mockCreateReport.mockRejectedValueOnce(new ApiError(429, 0, 'slow')).mockResolvedValueOnce(undefined);
    await render(sheet(message('standard')));
    await fireEvent.press(screen.getByLabelText('Spam'));
    await fireEvent.press(send());
    expect(await screen.findByText(/lot of reports/)).toBeTruthy();
    expect(screen.getByLabelText('Spam').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(send());
    expect(await screen.findByText('Report sent')).toBeTruthy();
  });
});
