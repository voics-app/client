import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ Menu: {}, clipboard: {}, shell: {} }));

const { buildTextMenu } = await import('../../../src/main/textMenu');
type P = Parameters<typeof buildTextMenu>[0];

const base: P = {
  isEditable: false,
  selectionText: '',
  misspelledWord: '',
  dictionarySuggestions: [],
  linkURL: '',
  mediaType: 'none',
  srcURL: '',
  editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
};
const labels = (p: Partial<P>) => buildTextMenu({ ...base, ...p }).map((i) => (i.type === 'separator' ? '-' : i.label));

describe('buildTextMenu', () => {
  it('is empty for plain content', () => expect(labels({})).toEqual([]));
  it('offers the edit commands in a text field', () => expect(labels({ isEditable: true })).toEqual(['Cut', 'Copy', 'Paste', 'Select all']));
  it('maps edit flags to enabled state', () => {
    const items = buildTextMenu({ ...base, isEditable: true, editFlags: { canCut: true, canCopy: true, canPaste: false, canSelectAll: true } });
    expect(items.flatMap((i) => (i.type === 'role' ? [[i.role, i.enabled]] : []))).toEqual([
      ['cut', true],
      ['copy', true],
      ['paste', false],
      ['selectAll', true],
    ]);
  });
  it('shows only Copy for selected static text', () => expect(labels({ selectionText: 'hi', editFlags: { ...base.editFlags, canCopy: true } })).toEqual(['Copy']));
  it('ignores whitespace-only selections', () => expect(labels({ selectionText: '  ' })).toEqual([]));
  it('lists at most five suggestions plus Add to dictionary', () => {
    const out = labels({ isEditable: true, misspelledWord: 'teh', dictionarySuggestions: ['the', 'ten', 'tea', 'tech', 'tell', 'tee', 'tel'] });
    expect(out.slice(0, 7)).toEqual(['the', 'ten', 'tea', 'tech', 'tell', 'Add to dictionary', '-']);
  });
  it('explains when there are no suggestions', () => expect(labels({ isEditable: true, misspelledWord: 'zzq' }).slice(0, 2)).toEqual(['No suggestions', 'Add to dictionary']));
  it('does not spellcheck outside editable fields', () => expect(labels({ misspelledWord: 'teh', dictionarySuggestions: ['the'] })).toEqual([]));
  it('offers open only for http(s) links', () => {
    expect(labels({ linkURL: 'https://a.example' })).toEqual(['Open link', 'Copy link address']);
    expect(labels({ linkURL: 'javascript:alert(1)' })).toEqual(['Copy link address']);
  });
  it('offers image actions', () => {
    expect(labels({ mediaType: 'image', srcURL: 'https://cdn.example/a.png' })).toEqual(['Copy image', 'Save image as...']);
    expect(labels({ mediaType: 'image', srcURL: 'blob:abc' })).toEqual(['Copy image']);
  });
});
