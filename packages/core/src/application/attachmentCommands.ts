import type { AttachmentMetadataEdit } from '../contracts/rest';
import type { ApiPort } from './ports/api';
import { useMessageStore, type ChatMessage } from './stores/messageStore';
import { useSessionStore } from './stores/sessionStore';

export function canEditAttachments(message: ChatMessage, userId: string | undefined): boolean {
  return Boolean(userId && message.author.id === userId && !message.localState
    && (message.deliveryMode ?? 'standard') === 'standard' && message.attachments.length);
}

/** Server-confirmed metadata updates; failures leave the timeline and the editor's draft intact. */
export async function editAttachments(api: Pick<ApiPort, 'editMessage'>, message: ChatMessage, edits: AttachmentMetadataEdit[]): Promise<void> {
  if (!canEditAttachments(message, useSessionStore.getState().user?.id)) throw new Error('Only the author can edit attachments in a standard chat.');
  if (edits.length === 0) return;
  const updated = await api.editMessage(message.channel_id, message.id, { attachments: edits });
  useMessageStore.getState().patch(message.channel_id, message.id, {
    attachments: updated.attachments,
    edited_timestamp: updated.edited_timestamp,
  });
}
