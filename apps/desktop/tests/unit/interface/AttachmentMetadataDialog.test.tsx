// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { AttachmentMetadataDialog } from '@renderer/interface/features/chat/AttachmentMetadataDialog';

const editMessage = vi.fn();
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { editMessage } }) }));
const author = { id: 'alice', username: 'alice', global_name: null, avatar: null };
const message: ChatMessage = { id: '17', channel_id: '12', author, content: 'original', timestamp: '', edited_timestamp: null,
  mention_everyone: false, mentions: [], mention_roles: [], embeds: [], pinned: false, type: 0,
  attachments: [{ id: '7', filename: 'SPOILER_cat.png', flags: 8, description: 'cat', size: 10, url: 'https://cdn.example/cat' }] };
const save = () => screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;

beforeEach(() => {
  editMessage.mockReset();
  useSessionStore.setState({ user: author });
  useMessageStore.getState().reset();
  useMessageStore.getState().receive(message);
});
afterEach(cleanup);

it('saves changed metadata and reflects the confirmed response in the timeline', async () => {
  const close = vi.fn();
  editMessage.mockResolvedValue({ ...message, attachments: [{ ...message.attachments[0], description: 'sleeping cat', flags: 0 }], edited_timestamp: '2026-11-18T04:00:00Z' });
  render(<AttachmentMetadataDialog message={message} onClose={close} />);
  expect(save().disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' sleeping cat ' } });
  fireEvent.click(screen.getByRole('switch', { name: 'Mark cat.png as spoiler' }));
  fireEvent.click(save());
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(editMessage).toHaveBeenCalledWith('12', '17', { attachments: [{ id: '7', description: 'sleeping cat', flags: 0 }] });
  expect(useMessageStore.getState().timelines['12']?.byId['17']?.attachments[0]).toMatchObject({ description: 'sleeping cat', flags: 0, filename: 'SPOILER_cat.png' });
});

it('retains failed edits for retry and sends an explicit null when clearing alt text', async () => {
  const close = vi.fn();
  editMessage.mockRejectedValueOnce(new Error('Offline. Try again.')).mockResolvedValueOnce({ ...message, attachments: [{ ...message.attachments[0], description: undefined }] });
  render(<AttachmentMetadataDialog message={message} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } });
  fireEvent.click(save());
  expect((await screen.findByRole('alert')).textContent).toContain('Could not save attachments');
  expect(close).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('');
  expect(useMessageStore.getState().timelines['12']?.byId['17']?.attachments[0]?.description).toBe('cat');
  fireEvent.click(save());
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(editMessage).toHaveBeenLastCalledWith('12', '17', { attachments: [{ id: '7', description: null }] });
});

it('validates character count and cancels without a request', () => {
  const close = vi.fn();
  render(<AttachmentMetadataDialog message={message} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'x'.repeat(1025) } });
  expect(save().disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('1,024');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  expect(editMessage).not.toHaveBeenCalled();
});

it('does not overwrite metadata that changed elsewhere while this editor was open', async () => {
  editMessage.mockResolvedValue(message);
  const close = vi.fn();
  const { rerender } = render(<AttachmentMetadataDialog message={message} onClose={close} />);
  const changedElsewhere = { ...message, attachments: [{ ...message.attachments[0]!, description: 'another device' }] };
  rerender(<AttachmentMetadataDialog message={changedElsewhere} onClose={close} />);
  fireEvent.click(screen.getByRole('switch', { name: 'Mark cat.png as spoiler' }));
  fireEvent.click(save());
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(editMessage).toHaveBeenCalledWith('12', '17', { attachments: [{ id: '7', flags: 0 }] });
});
