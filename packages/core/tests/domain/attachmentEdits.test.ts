import { describe, expect, it } from 'vitest';
import type { Attachment } from '@discordy/core/contracts/rest';
import { attachmentDraft, attachmentMetadataEdits } from '@discordy/core/domain/attachmentEdits';

const attachment: Attachment = { id: '7', filename: 'SPOILER_cat.png', description: 'cat', flags: 8, size: 10, url: 'https://cdn.example/cat' };

describe('attachment metadata patches', () => {
  it('clears description and spoiler without changing the file or unrelated flags', () => {
    const edits = attachmentMetadataEdits([attachment], [{ ...attachmentDraft(attachment), description: ' ', spoiler: false }]);
    expect(edits).toEqual([{ id: '7', description: null, flags: 0 }]);
  });
  it('sends only edited fields and omits untouched attachments', () => {
    const other = { ...attachment, id: '8', flags: 16 };
    expect(attachmentMetadataEdits([attachment, other], [attachmentDraft(attachment), { ...attachmentDraft(other), description: '  a sleeping cat  ' }]))
      .toEqual([{ id: '8', description: 'a sleeping cat' }]);
    expect(attachmentDraft(other).spoiler).toBe(false);
  });
  it('uses Unicode character count and rejects duplicate or unknown ids', () => {
    const draft = { ...attachmentDraft(attachment), description: '🐈'.repeat(1024) };
    expect(attachmentMetadataEdits([attachment], [draft])[0]?.description).toBe(draft.description);
    expect(() => attachmentMetadataEdits([attachment], [{ ...draft, description: `${draft.description}x` }])).toThrow('1024');
    expect(() => attachmentMetadataEdits([attachment], [draft, draft])).toThrow('no longer available');
    expect(() => attachmentMetadataEdits([], [draft])).toThrow('no longer available');
  });
});
