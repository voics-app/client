import { emojiText, insertAt, pickerRows, pickerSections } from '../../src/emoji/emojiPickerModel';

const guilds = [{ id: 'g1', name: 'Home', emojis: [{ id: '77', name: 'party', animated: false }, { id: '78', name: 'wave', animated: true }] }, { id: 'g2', name: 'Other', emojis: [{ id: '90', name: 'far', animated: false }] }];

describe('pickerSections', () => {
  it('lists recent, then the current server custom emoji, then the unicode categories', () => {
    const sections = pickerSections({ recent: [{ id: null, name: 'x' }], guilds, guildId: 'g1', query: '' });
    expect(sections.slice(0, 2).map((s) => s.id)).toEqual(['recent', 'guild:g1']);
    expect(sections.some((s) => s.id === 'smileys')).toBe(true);
    expect(sections.some((s) => s.id === 'guild:g2')).toBe(false);
  });

  it('leaves out Frequently used when nothing was used yet', () => {
    expect(pickerSections({ recent: [], guilds, guildId: 'g1', query: '' })[0]!.id).toBe('guild:g1');
  });

  it('turns a search into one list of custom and unicode matches', () => {
    const sections = pickerSections({ recent: [], guilds, guildId: 'g1', query: 'par' });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.emoji[0]).toMatchObject({ id: '77', name: 'party' });
  });

  it('finds unicode emoji by shortcode and returns nothing for gibberish', () => {
    expect(pickerSections({ recent: [], guilds: [], guildId: undefined, query: 'fire' })[0]!.emoji.map((e) => e.name)).toContain('\u{1F525}');
    expect(pickerSections({ recent: [], guilds: [], guildId: undefined, query: 'zzzzqq' })).toEqual([]);
  });
});

describe('pickerRows', () => {
  it('puts a header before each section and splits emoji into rows of the column count', () => {
    const emoji = Array.from({ length: 11 }, (_, i) => ({ id: null, name: String(i) }));
    const rows = pickerRows([{ id: 's', title: 'S', emoji }], 8);
    expect(rows.map((r) => (r.kind === 'header' ? 'header' : r.items.length))).toEqual(['header', 8, 3]);
  });
});

describe('emoji text', () => {
  it('writes custom emoji in message syntax and unicode as it is', () => {
    expect(emojiText({ id: '77', name: 'party' })).toBe('<:party:77>');
    expect(emojiText({ id: '78', name: 'wave', animated: true })).toBe('<a:wave:78>');
    expect(emojiText({ id: null, name: '\u{1F389}' })).toBe('\u{1F389}');
  });

  it('inserts at the cursor and replaces a selection', () => {
    expect(insertAt('hello world', { start: 5, end: 5 }, '!')).toEqual({ text: 'hello! world', cursor: 6 });
    expect(insertAt('hello world', { start: 6, end: 11 }, 'x')).toEqual({ text: 'hello x', cursor: 7 });
    expect(insertAt('ab', { start: 2, end: 0 }, '-')).toEqual({ text: '-', cursor: 1 });
  });
});
