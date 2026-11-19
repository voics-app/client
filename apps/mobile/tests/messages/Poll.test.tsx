import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Message, Poll } from '@discordy/core/contracts/rest';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { CreatePollSheet, MessagePoll } from '../../src/messages/Poll';

const mockApi = { sendMessage: jest.fn(), getPoll: jest.fn(), setPollVote: jest.fn(), endPoll: jest.fn() };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ api: mockApi }) }));
jest.mock('../../src/sheets/BottomSheet', () => ({ BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));
const poll: Poll = { question: { text: 'Lunch?' }, answers: [{ answer_id: 1, poll_media: { text: 'Soup' } }, { answer_id: 2, poll_media: { text: 'Salad' } }], expiry: '2099-01-01T00:00:00Z', allow_multiselect: false, layout_type: 1, results: { version: '0', vote_version: '0', is_finalized: false, answer_counts: [{ id: 1, count: 0, me_voted: false }, { id: 2, count: 0, me_voted: false }] } };
const message = { id: '3', channel_id: '2', author: { id: '1' }, poll, timestamp: '2026-01-01T00:00:00Z', attachments: [], embeds: [] } as unknown as Message;
beforeEach(() => { jest.clearAllMocks(); useMessageStore.getState().reset(); useSessionStore.setState({ user: { id: '1' } } as never); mockApi.getPoll.mockResolvedValue(poll); });

it('creates a poll with the canonical payload', async () => {
  mockApi.sendMessage.mockResolvedValue(message);
  const close = jest.fn();
  await render(<CreatePollSheet visible channelId="2" onClose={close} />);
  await fireEvent.changeText(screen.getByLabelText('Question'), 'Lunch?');
  await fireEvent.changeText(screen.getByLabelText('Answer 1'), 'Soup');
  await fireEvent.changeText(screen.getByLabelText('Answer 2'), 'Salad');
  await fireEvent.press(screen.getByRole('button', { name: 'Create poll' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(mockApi.sendMessage).toHaveBeenCalledWith('2', expect.objectContaining({ poll: { question: { text: 'Lunch?' }, answers: [{ poll_media: { text: 'Soup' } }, { poll_media: { text: 'Salad' } }], duration: 24, allow_multiselect: false, layout_type: 1 } }));
});

it('sends the viewer revision and allows the author to end', async () => {
  useMessageStore.getState().receive(message);
  mockApi.setPollVote.mockResolvedValue(poll);
  mockApi.endPoll.mockResolvedValue(message);
  await render(<MessagePoll message={message} />);
  await waitFor(() => expect(mockApi.getPoll).toHaveBeenCalled());
  await fireEvent.press(screen.getByText('Soup'));
  await waitFor(() => expect(mockApi.setPollVote).toHaveBeenCalledWith('2', '3', 1, true, '0'));
  await waitFor(() => expect(screen.getByText('End poll')).toBeTruthy());
  await fireEvent.press(screen.getByText('End poll'));
  await waitFor(() => expect(mockApi.endPoll).toHaveBeenCalledWith('2', '3'));
});
