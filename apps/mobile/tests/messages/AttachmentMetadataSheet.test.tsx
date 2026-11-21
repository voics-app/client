import { fireEvent, render as renderPlain, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { AttachmentMetadataSheet } from '../../src/messages/AttachmentMetadataSheet';

const mockEditMessage = jest.fn();
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ api: { editMessage: mockEditMessage } }) }));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
const render = (ui: ReactElement) => renderPlain(wrap(ui));
const author = { id: 'alice', username: 'alice', global_name: null, avatar: null };
const message: ChatMessage = { id: '17', channel_id: '12', author, content: 'original', timestamp: '', edited_timestamp: null,
  mention_everyone: false, mentions: [], mention_roles: [], embeds: [], pinned: false, type: 0,
  attachments: [{ id: '7', filename: 'SPOILER_cat.png', flags: 8, description: 'cat', size: 10, url: 'https://cdn.example/cat' }] };

beforeEach(() => {
  mockEditMessage.mockReset();
  useSessionStore.setState({ user: author });
  useMessageStore.getState().reset();
  useMessageStore.getState().receive(message);
});

it('saves descriptions and clears the spoiler flag without renaming the file', async () => {
  const close = jest.fn();
  mockEditMessage.mockResolvedValue({ ...message, attachments: [{ ...message.attachments[0], description: 'sleeping cat', flags: 0 }] });
  await render(<AttachmentMetadataSheet message={message} onClose={close} />);
  await fireEvent.changeText(screen.getByLabelText('Description for cat.png'), ' sleeping cat ');
  await fireEvent(screen.getByLabelText('Mark cat.png as spoiler'), 'valueChange', false);
  await fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockEditMessage).toHaveBeenCalledWith('12', '17', { attachments: [{ id: '7', description: 'sleeping cat', flags: 0 }] });
  expect(useMessageStore.getState().timelines['12']?.byId['17']?.attachments[0]).toMatchObject({ description: 'sleeping cat', flags: 0, filename: 'SPOILER_cat.png' });
});

it('retains failed edits for retry and validates length before sending', async () => {
  const close = jest.fn();
  mockEditMessage.mockRejectedValueOnce(new Error('Offline. Try again.')).mockResolvedValueOnce({ ...message, attachments: [{ ...message.attachments[0], description: undefined }] });
  await render(<AttachmentMetadataSheet message={message} onClose={close} />);
  await fireEvent.changeText(screen.getByLabelText('Description for cat.png'), 'x'.repeat(1025));
  expect(screen.getByLabelText('Save changes')).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Use 1024 characters or fewer.');
  await fireEvent.changeText(screen.getByLabelText('Description for cat.png'), '');
  await fireEvent.press(screen.getByLabelText('Save changes'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save attachments/);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Description for cat.png')).toHaveProp('value', '');
  expect(useMessageStore.getState().timelines['12']?.byId['17']?.attachments[0]?.description).toBe('cat');
  await fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockEditMessage).toHaveBeenLastCalledWith('12', '17', { attachments: [{ id: '7', description: null }] });
});

it('discards cancelled drafts when the same message is opened again', async () => {
  const close = jest.fn();
  const view = await render(<AttachmentMetadataSheet message={message} onClose={close} />);
  await fireEvent.changeText(screen.getByLabelText('Description for cat.png'), 'unsaved');
  await fireEvent.press(screen.getByLabelText('Cancel'));
  expect(close).toHaveBeenCalledTimes(1);
  expect(mockEditMessage).not.toHaveBeenCalled();
  await view.rerender(wrap(<AttachmentMetadataSheet message={null} onClose={close} />));
  await view.rerender(wrap(<AttachmentMetadataSheet message={message} onClose={close} />));
  expect(screen.getByLabelText('Description for cat.png')).toHaveProp('value', 'cat');
});
