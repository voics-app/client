import { beforeEach, expect, it, vi } from 'vitest';
import { canEditAttachments, editAttachments } from '@discordy/core/application/attachmentCommands';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

const user = { id: 'alice', username: 'alice', global_name: null, avatar: null };
const message: ChatMessage = { id: '17', channel_id: '12', author: user, content: 'original', timestamp: '', edited_timestamp: null,
  mention_everyone: false, mentions: [], mention_roles: [], embeds: [], pinned: false, type: 0,
  attachments: [{ id: '7', filename: 'SPOILER_cat.png', flags: 8, description: 'cat', size: 10, url: 'https://cdn.example/cat' }] };

beforeEach(() => {
  useSessionStore.setState({ user });
  useMessageStore.getState().reset();
  useMessageStore.getState().receive(message);
});

it('requires an author-owned, sent standard message', () => {
  expect(canEditAttachments(message, 'alice')).toBe(true);
  expect(canEditAttachments(message, 'bob')).toBe(false);
  expect(canEditAttachments({ ...message, deliveryMode: 'p2p' }, 'alice')).toBe(false);
  expect(canEditAttachments({ ...message, deliveryMode: 'ephemeral' }, 'alice')).toBe(false);
  expect(canEditAttachments({ ...message, localState: 'sending' }, 'alice')).toBe(false);
});

it('applies the confirmed metadata without replacing newer message text', async () => {
  const updated = { ...message, attachments: [{ ...message.attachments[0]!, flags: 0 }], edited_timestamp: '2026-11-18T04:00:00Z' };
  const api = { editMessage: vi.fn(async () => updated) };
  useMessageStore.getState().patch('12', '17', { content: 'newer edit' });
  await editAttachments(api, message, [{ id: '7', flags: 0 }]);
  expect(api.editMessage).toHaveBeenCalledWith('12', '17', { attachments: [{ id: '7', flags: 0 }] });
  expect(useMessageStore.getState().timelines['12']?.byId['17']).toMatchObject({ attachments: updated.attachments, content: 'newer edit', edited_timestamp: updated.edited_timestamp });
});

it('keeps state unchanged on rejection and rechecks identity when saving', async () => {
  const api = { editMessage: vi.fn(async () => { throw new Error('offline'); }) };
  await expect(editAttachments(api, message, [{ id: '7', flags: 0 }])).rejects.toThrow('offline');
  expect(useMessageStore.getState().timelines['12']?.byId['17']?.attachments).toEqual(message.attachments);
  useSessionStore.setState({ user: { ...user, id: 'bob' } });
  await expect(editAttachments(api, message, [{ id: '7', flags: 0 }])).rejects.toThrow('Only the author');
  expect(api.editMessage).toHaveBeenCalledTimes(1);
});
