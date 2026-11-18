import { AttachmentFlag, type Attachment, type AttachmentMetadataEdit } from '../contracts/rest';
import { ALT_TEXT_MAX, isSpoiler } from './media';

export interface AttachmentDraft {
  id: string;
  description: string;
  spoiler: boolean;
}

export function attachmentDraft(attachment: Attachment): AttachmentDraft {
  return { id: attachment.id, description: attachment.description ?? '', spoiler: isSpoiler(attachment) };
}

/** Only changed metadata is sent, preserving other fields edited from another device. */
export function attachmentMetadataEdits(original: Attachment[], drafts: AttachmentDraft[]): AttachmentMetadataEdit[] {
  if (drafts.length > 10) throw new Error('A message can have at most 10 attachments.');
  const seen = new Set<string>();
  const edits: AttachmentMetadataEdit[] = [];
  for (const draft of drafts) {
    const before = original.find((attachment) => attachment.id === draft.id);
    if (!before || seen.has(draft.id)) throw new Error('This attachment is no longer available.');
    seen.add(draft.id);
    const description = draft.description.trim();
    if ([...description].length > ALT_TEXT_MAX) throw new Error(`Descriptions can have at most ${ALT_TEXT_MAX} characters.`);
    const patch: AttachmentMetadataEdit = { id: draft.id };
    if (description !== (before.description ?? '')) patch.description = description || null;
    if (draft.spoiler !== isSpoiler(before)) patch.flags = draft.spoiler ? AttachmentFlag.IS_SPOILER : 0;
    if (patch.description !== undefined || patch.flags !== undefined) edits.push(patch);
  }
  return edits;
}
