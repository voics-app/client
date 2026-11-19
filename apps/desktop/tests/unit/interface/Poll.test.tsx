// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { Message, Poll } from '@discordy/core/contracts/rest';

const api = vi.hoisted(() => ({ sendMessage: vi.fn(), getPoll: vi.fn(), setPollVote: vi.fn(), endPoll: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api }) }));
import { CreatePoll, MessagePoll } from '@renderer/interface/features/chat/Poll';

const snapshot: Poll = { question: { text: 'Lunch?' }, answers: [{ answer_id: 1, poll_media: { text: 'Soup' } }, { answer_id: 2, poll_media: { text: 'Salad' } }], expiry: '2099-01-01T00:00:00Z', allow_multiselect: false, layout_type: 1, results: { version: '0', vote_version: '0', is_finalized: false, answer_counts: [{ id: 1, count: 0, me_voted: false }, { id: 2, count: 0, me_voted: false }] } };
const message = { id: '3', channel_id: '2', author: { id: '1' }, poll: snapshot, timestamp: '2026-01-01T00:00:00Z', attachments: [], embeds: [] } as unknown as Message;
beforeEach(() => { vi.clearAllMocks(); useMessageStore.getState().reset(); useSessionStore.setState({ user: { id: '1' } } as never); api.getPoll.mockResolvedValue(snapshot); });
afterEach(cleanup);

it('creates a poll with the contract shape', async () => {
  api.sendMessage.mockResolvedValue(message);
  const close = vi.fn();
  render(<CreatePoll channelId="2" onClose={close} />);
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Lunch?' } });
  fireEvent.change(screen.getByLabelText('Answer 1'), { target: { value: 'Soup' } });
  fireEvent.change(screen.getByLabelText('Answer 2'), { target: { value: 'Salad' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create poll' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(api.sendMessage).toHaveBeenCalledWith('2', expect.objectContaining({ poll: { question: { text: 'Lunch?' }, answers: [{ poll_media: { text: 'Soup' } }, { poll_media: { text: 'Salad' } }], duration: 24, allow_multiselect: false, layout_type: 1 } }));
});

it('votes with viewer revision and ends an author poll', async () => {
  useMessageStore.getState().receive(message);
  api.setPollVote.mockResolvedValue(snapshot);
  api.endPoll.mockResolvedValue({ ...message, poll: { ...snapshot, results: { ...snapshot.results!, is_finalized: true, version: '1' } } });
  render(<MessagePoll message={message} />);
  await waitFor(() => expect(api.getPoll).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /Soup/ }));
  await waitFor(() => expect(api.setPollVote).toHaveBeenCalledWith('2', '3', 1, true, '0'));
  await waitFor(() => expect((screen.getByRole('button', { name: 'End poll' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'End poll' }));
  await waitFor(() => expect(api.endPoll).toHaveBeenCalledWith('2', '3'));
});

it('creates, votes, and finalizes through the visible message flow', async () => {
  const selected = { ...snapshot, results: { ...snapshot.results!, version: '1', vote_version: '1', answer_counts: [{ id: 1, count: 1, me_voted: true }, { id: 2, count: 0, me_voted: false }] } };
  const ended = { ...selected, results: { ...selected.results, version: '2', is_finalized: true } };
  api.sendMessage.mockResolvedValue(message);
  api.setPollVote.mockResolvedValue(selected);
  api.endPoll.mockResolvedValue({ ...message, poll: ended });
  function Timeline() {
    const current = useMessageStore((state) => state.timelines['2']?.byId['3']);
    return <><CreatePoll channelId="2" onClose={() => undefined} />{current && <MessagePoll message={current} />}</>;
  }
  render(<Timeline />);
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Lunch?' } });
  fireEvent.change(screen.getByLabelText('Answer 1'), { target: { value: 'Soup' } });
  fireEvent.change(screen.getByLabelText('Answer 2'), { target: { value: 'Salad' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create poll' }));
  const answer = await screen.findByRole('button', { name: /Soup/ });
  fireEvent.click(answer);
  await waitFor(() => expect(screen.getByRole('button', { name: /Soup/ }).getAttribute('aria-pressed')).toBe('true'));
  fireEvent.click(screen.getByRole('button', { name: 'End poll' }));
  await screen.findByText(/Poll ended/);
  expect((screen.getByRole('button', { name: /Soup/ }) as HTMLButtonElement).disabled).toBe(true);
});
