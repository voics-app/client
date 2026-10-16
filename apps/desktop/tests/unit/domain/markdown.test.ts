import { describe, expect, it } from 'vitest';
import { parseMarkdown, extractMentionedUserIds } from '@renderer/domain/markdown';

describe('parseMarkdown', () => {
  it('parses plain text', () => {
    expect(parseMarkdown('hello')).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('parses bold, italic, underline, strike and spoilers', () => {
    expect(parseMarkdown('**b** *i* __u__ ~~s~~ ||x||')).toEqual([
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'i' }] },
      { type: 'text', text: ' ' },
      { type: 'underline', children: [{ type: 'text', text: 'u' }] },
      { type: 'text', text: ' ' },
      { type: 'strike', children: [{ type: 'text', text: 's' }] },
      { type: 'text', text: ' ' },
      { type: 'spoiler', children: [{ type: 'text', text: 'x' }] },
    ]);
  });

  it('does not parse formatting inside inline code', () => {
    expect(parseMarkdown('`**raw**`')).toEqual([{ type: 'code', text: '**raw**' }]);
  });

  it('parses fenced code blocks with a language', () => {
    expect(parseMarkdown('```ts\nconst a = 1;\n```')).toEqual([
      { type: 'codeblock', lang: 'ts', text: 'const a = 1;' },
    ]);
  });

  it('parses user, role, channel mentions and custom emoji', () => {
    expect(parseMarkdown('<@123> <@&456> <#789> <:wave:42> <a:spin:43>')).toEqual([
      { type: 'userMention', id: '123' },
      { type: 'text', text: ' ' },
      { type: 'roleMention', id: '456' },
      { type: 'text', text: ' ' },
      { type: 'channelMention', id: '789' },
      { type: 'text', text: ' ' },
      { type: 'customEmoji', name: 'wave', id: '42', animated: false },
      { type: 'text', text: ' ' },
      { type: 'customEmoji', name: 'spin', id: '43', animated: true },
    ]);
  });

  it('parses @everyone and @here', () => {
    expect(parseMarkdown('hi @everyone')).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'everyone', kind: 'everyone' },
    ]);
  });

  it('links bare URLs', () => {
    expect(parseMarkdown('see https://voics.nl/x?y=1.')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', url: 'https://voics.nl/x?y=1' },
      { type: 'text', text: '.' },
    ]);
  });

  it('parses block quotes', () => {
    expect(parseMarkdown('> quoted\nnext')).toEqual([
      { type: 'quote', children: [{ type: 'text', text: 'quoted' }] },
      { type: 'text', text: '\nnext' },
    ]);
  });

  it('leaves unmatched markers as text', () => {
    expect(parseMarkdown('2 * 3 = 6')).toEqual([{ type: 'text', text: '2 * 3 = 6' }]);
  });
});

describe('extractMentionedUserIds', () => {
  it('returns unique user ids', () => {
    expect(extractMentionedUserIds('<@1> and <@!2> and <@1>')).toEqual(['1', '2']);
  });
});
