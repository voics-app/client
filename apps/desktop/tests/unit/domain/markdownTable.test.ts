import { describe, expect, it } from 'vitest';
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, parseMarkdown, toPlainText } from '@renderer/domain/markdown';

const txt = (text: string) => [{ type: 'text', text }];

describe('markdown tables', () => {
  it('parses a header, alignment and body rows', () => {
    const nodes = parseMarkdown('| Name | Qty | Note |\n|:--|--:|:-:|\n| a | 1 | x |\n| b | 2 | y |');
    expect(nodes).toEqual([
      {
        type: 'table',
        align: ['left', 'right', 'center'],
        header: [txt('Name'), txt('Qty'), txt('Note')],
        rows: [
          [txt('a'), txt('1'), txt('x')],
          [txt('b'), txt('2'), txt('y')],
        ],
      },
    ]);
  });

  it('accepts rows without outer pipes and defaults alignment to none', () => {
    const [table] = parseMarkdown('a | b\n--- | ---\n1 | 2');
    expect(table).toMatchObject({ type: 'table', align: [null, null], header: [txt('a'), txt('b')] });
  });

  it('pads short rows, trims long rows and parses inline markdown in cells', () => {
    const [table] = parseMarkdown('| a | b |\n|---|---|\n| **x** |\n| 1 | 2 | 3 |');
    expect(table).toMatchObject({
      rows: [
        [[{ type: 'bold', children: txt('x') }], []],
        [txt('1'), txt('2')],
      ],
    });
  });

  it('keeps an escaped pipe inside a cell', () => {
    const [table] = parseMarkdown('| a | b |\n|---|---|\n| x \\| y | z |');
    expect(table).toMatchObject({ rows: [[txt('x | y'), txt('z')]] });
  });

  it('keeps text before and after the table', () => {
    const nodes = parseMarkdown('intro\n| a |\n|---|\n| 1 |\noutro');
    expect(nodes.map((n) => n.type)).toEqual(['text', 'table', 'text']);
  });

  it('is not a table without a valid delimiter row or with mismatched columns', () => {
    expect(parseMarkdown('| a | b |\n| x | y |').some((n) => n.type === 'table')).toBe(false);
    expect(parseMarkdown('| a | b |\n|---|\n| 1 | 2 |').some((n) => n.type === 'table')).toBe(false);
    expect(parseMarkdown('just | text').some((n) => n.type === 'table')).toBe(false);
  });

  it('limits columns by leaving the text literal', () => {
    const cols = Array.from({ length: MAX_TABLE_COLUMNS + 1 }, (_, i) => `c${i}`);
    const src = `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n| ${cols.join(' | ')} |`;
    expect(parseMarkdown(src).some((n) => n.type === 'table')).toBe(false);
  });

  it('limits rows and leaves the remainder as text', () => {
    const body = Array.from({ length: MAX_TABLE_ROWS + 3 }, (_, i) => `| r${i} |`).join('\n');
    const [table, rest] = parseMarkdown(`| h |\n|---|\n${body}`);
    expect(table).toMatchObject({ type: 'table' });
    expect((table as { rows: unknown[] }).rows).toHaveLength(MAX_TABLE_ROWS);
    expect(rest).toBeDefined();
  });

  it('does not parse tables inside code blocks', () => {
    expect(parseMarkdown('```\n| a |\n|---|\n```')).toEqual([{ type: 'codeblock', lang: null, text: '| a |\n|---|' }]);
  });

  it('renders plain text as tab-separated rows', () => {
    expect(toPlainText(parseMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'))).toBe('a\tb\n1\t2');
  });
});
