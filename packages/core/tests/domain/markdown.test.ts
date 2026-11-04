import { describe, expect, it } from 'vitest';
import { parseMarkdown, extractMentionedUserIds, toPlainText } from '@discordy/core/domain/markdown';

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
      { type: 'text', text: 'next' },
    ]);
  });

  it('leaves unmatched markers as text', () => {
    expect(parseMarkdown('2 * 3 = 6')).toEqual([{ type: 'text', text: '2 * 3 = 6' }]);
  });
});

const t = (text: string) => ({ type: 'text', text });

describe('parseMarkdown blocks', () => {
  it('parses headers 1-3 and leaves #### as text', () => {
    expect(parseMarkdown('# One\n## Two\n### Three\n#### Four')).toEqual([
      { type: 'heading', level: 1, children: [t('One')] },
      { type: 'heading', level: 2, children: [t('Two')] },
      { type: 'heading', level: 3, children: [t('Three')] },
      t('#### Four'),
    ]);
  });

  it('requires a space and line start for headers', () => {
    expect(parseMarkdown('#nope')).toEqual([t('#nope')]);
    expect(parseMarkdown('a # b')).toEqual([t('a # b')]);
  });

  it('formats inside headers', () => {
    expect(parseMarkdown('# **big**')).toEqual([{ type: 'heading', level: 1, children: [{ type: 'bold', children: [t('big')] }] }]);
  });

  it('parses subtext', () => {
    expect(parseMarkdown('-# small print\nafter')).toEqual([{ type: 'subtext', children: [t('small print')] }, t('after')]);
  });

  it('parses bullet lists with - and *', () => {
    expect(parseMarkdown('- a\n* b')).toEqual([{ type: 'list', ordered: false, start: 1, items: [[t('a')], [t('b')]] }]);
  });

  it('parses numbered lists with their start', () => {
    expect(parseMarkdown('3. a\n4. b')).toEqual([{ type: 'list', ordered: true, start: 3, items: [[t('a')], [t('b')]] }]);
  });

  it('parses nested lists', () => {
    expect(parseMarkdown('- a\n  - b\n  - c\n- d\nend')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          [t('a'), { type: 'list', ordered: false, start: 1, items: [[t('b')], [t('c')]] }],
          [t('d')],
        ],
      },
      t('end'),
    ]);
  });

  it('keeps a list inline when the marker has no space', () => {
    expect(parseMarkdown('-a')).toEqual([t('-a')]);
    expect(parseMarkdown('1.a')).toEqual([t('1.a')]);
  });

  it('merges consecutive > lines into one quote', () => {
    expect(parseMarkdown('> a\n> b\nc')).toEqual([{ type: 'quote', children: [t('a\nb')] }, t('c')]);
  });

  it('parses >>> as a quote to the end of the message', () => {
    expect(parseMarkdown('>>> a\nb\n**c**')).toEqual([
      { type: 'quote', children: [t('a\nb\n'), { type: 'bold', children: [t('c')] }] },
    ]);
  });

  it('does not parse blocks inside code fences', () => {
    expect(parseMarkdown('```\n# no\n- no\n```')).toEqual([{ type: 'codeblock', lang: null, text: '# no\n- no' }]);
  });
});

describe('parseMarkdown links, timestamps and escapes', () => {
  it('parses masked links', () => {
    expect(parseMarkdown('[docs](https://example.com/a?b=1)')).toEqual([
      { type: 'link', url: 'https://example.com/a?b=1', label: [t('docs')] },
    ]);
  });

  it('formats the label of a masked link', () => {
    expect(parseMarkdown('[**x**](https://e.com)')).toEqual([
      { type: 'link', url: 'https://e.com', label: [{ type: 'bold', children: [t('x')] }] },
    ]);
  });

  it('never makes a link out of javascript:, data: or file: URLs', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'vbscript:x']) {
      const nodes = parseMarkdown(`[click](${url})`);
      expect(nodes.some((n) => n.type === 'link')).toBe(false);
    }
  });

  it('keeps raw HTML as text', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)><script>x</script>')).toEqual([t('<img src=x onerror=alert(1)><script>x</script>')]);
  });

  it('parses <url> autolinks', () => {
    expect(parseMarkdown('<https://e.com/x>')).toEqual([{ type: 'link', url: 'https://e.com/x' }]);
  });

  it('parses timestamps in every style and defaults to f', () => {
    for (const style of ['t', 'T', 'd', 'D', 'f', 'F', 'R'] as const) {
      expect(parseMarkdown(`<t:1700000000:${style}>`)).toEqual([{ type: 'timestamp', unix: 1700000000, style }]);
    }
    expect(parseMarkdown('<t:1700000000>')).toEqual([{ type: 'timestamp', unix: 1700000000, style: 'f' }]);
  });

  it('rejects invalid timestamp styles', () => {
    expect(parseMarkdown('<t:1:x>').some((n) => n.type === 'timestamp')).toBe(false);
  });

  it('honours backslash escapes', () => {
    expect(parseMarkdown('\\*not italic\\* \\# \\> \\|\\|x\\|\\|')).toEqual([t('*not italic* # > ||x||')]);
    expect(parseMarkdown('\\# no header')).toEqual([t('# no header')]);
    expect(parseMarkdown('\\[a](https://e.com)').some((n) => n.type === 'link' && n.label)).toBe(false);
  });

  it('keeps a lone backslash before a letter', () => {
    expect(parseMarkdown('a\\b')).toEqual([t('a\\b')]);
  });
});

describe('parseMarkdown robustness', () => {
  it('survives malformed input', () => {
    for (const src of ['**', '[x](', '[](https://e.com)', '> ', '>>> ', '# ', '-# ', '```', '||', '<t:', '<@>', '- ', '1. ', '[a](https://e.com', '\\']) {
      expect(() => parseMarkdown(src)).not.toThrow();
    }
  });

  it('caps nesting depth', () => {
    expect(() => parseMarkdown('> '.repeat(500) + 'x')).not.toThrow();
    const deep = '- a\n' + Array.from({ length: 60 }, (_, i) => ' '.repeat((i + 1) * 2) + '- b').join('\n');
    expect(() => parseMarkdown(deep)).not.toThrow();
  });

  it('handles long adversarial input quickly', () => {
    const start = Date.now();
    parseMarkdown('*'.repeat(2000));
    parseMarkdown('['.repeat(2000));
    parseMarkdown('_a '.repeat(700));
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe('toPlainText', () => {
  it('uses the label of masked links and flattens lists', () => {
    expect(toPlainText(parseMarkdown('[hi](https://e.com)\n- a\n- b'))).toBe('hi\n• a\n• b');
  });
});

describe('extractMentionedUserIds', () => {
  it('returns unique user ids', () => {
    expect(extractMentionedUserIds('<@1> and <@!2> and <@1>')).toEqual(['1', '2']);
  });
});
