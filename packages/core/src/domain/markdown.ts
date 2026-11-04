/** Discord-flavoured markdown parser producing a renderer-agnostic AST. */

export type MarkdownNode =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler' | 'quote'; children: MarkdownNode[] }
  | { type: 'code'; text: string }
  | { type: 'codeblock'; lang: string | null; text: string }
  | { type: 'userMention' | 'roleMention' | 'channelMention'; id: string }
  | { type: 'customEmoji'; name: string; id: string; animated: boolean }
  | { type: 'everyone'; kind: 'everyone' | 'here' }
  | { type: 'link'; url: string; label?: MarkdownNode[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: MarkdownNode[] }
  | { type: 'subtext'; children: MarkdownNode[] }
  | { type: 'list'; ordered: boolean; start: number; items: MarkdownNode[][] }
  | { type: 'table'; align: TableAlign[]; header: MarkdownNode[][]; rows: MarkdownNode[][][] }
  | { type: 'timestamp'; unix: number; style: TimestampStyle };

export type TableAlign = 'left' | 'center' | 'right' | null;

/** Table limits: wider or longer input stays literal text (rows) or is not a table at all (columns). */
export const MAX_TABLE_COLUMNS = 12;
export const MAX_TABLE_ROWS = 50;

export type TimestampStyle = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';

/** Nesting guard: deeper structures are kept as literal text so hostile input cannot blow the stack. */
const MAX_DEPTH = 8;

type Rule = {
  pattern: RegExp;
  lineStart?: boolean;
  build: (m: RegExpExecArray) => MarkdownNode;
};

let depth = 0;

const wrap =
  (type: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler' | 'quote') =>
  (m: RegExpExecArray): MarkdownNode => ({ type, children: parseMarkdown(m[1] ?? '') });

/** Labels of masked links are plain content: nested links would hide the real destination. */
function stripLinks(nodes: MarkdownNode[]): MarkdownNode[] {
  return nodes.map((n): MarkdownNode => {
    if (n.type === 'link') return { type: 'text', text: n.label ? toPlainText(n.label) : n.url };
    if ('children' in n) return { ...n, children: stripLinks(n.children) } as MarkdownNode;
    return n;
  });
}

const LIST_LINE = /^( {0,16})([-*]|(\d{1,9})\.) +(\S.*)$/;

interface ListLine {
  indent: number;
  ordered: boolean;
  number: number;
  content: string;
}

function buildList(lines: ListLine[], from: number, indent: number): { node: MarkdownNode; next: number } {
  const first = lines[from]!;
  const items: MarkdownNode[][] = [];
  let i = from;
  while (i < lines.length && lines[i]!.indent === indent && lines[i]!.ordered === first.ordered) {
    const item: MarkdownNode[] = parseMarkdown(lines[i]!.content);
    i += 1;
    if (i < lines.length && lines[i]!.indent > indent) {
      const nested = buildList(lines, i, lines[i]!.indent);
      item.push(nested.node);
      i = nested.next;
    }
    items.push(item);
  }
  return { node: { type: 'list', ordered: first.ordered, start: first.ordered ? first.number : 1, items }, next: i };
}

/** Splits one pipe-table line into raw cells, honouring escaped pipes\|` escapes and optional outer pipes. */
function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      cell += '|';
      i += 1;
    } else if (line[i] === '|') {
      cells.push(cell);
      cell = '';
    } else cell += line[i];
  }
  cells.push(cell);
  if (cells[0]!.trim() === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1]!.trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

function delimiterAlign(cell: string): TableAlign | undefined {
  if (!/^:?-+:?$/.test(cell)) return undefined;
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
}

/** GitHub-style pipe table: header row, delimiter row, then body rows until the first non-pipe line. */
function parseTable(rest: string): { node: MarkdownNode; length: number } | null {
  const lines = rest.split('\n');
  if (lines.length < 2 || !lines[0]!.includes('|') || !lines[1]!.includes('-')) return null;
  const header = splitTableRow(lines[0]!);
  const aligns = splitTableRow(lines[1]!).map(delimiterAlign);
  if (header.length === 0 || header.length > MAX_TABLE_COLUMNS || aligns.length !== header.length) return null;
  if (aligns.some((a) => a === undefined)) return null;
  const columns = header.length;
  const cell = (raw: string | undefined): MarkdownNode[] => (raw ? parseMarkdown(raw) : []);
  const rows: MarkdownNode[][][] = [];
  let used = 2;
  while (used < lines.length && rows.length < MAX_TABLE_ROWS && lines[used]!.includes('|')) {
    const raw = splitTableRow(lines[used]!);
    rows.push(Array.from({ length: columns }, (_, c) => cell(raw[c])));
    used += 1;
  }
  const length = Math.min(lines.slice(0, used).join('\n').length + 1, rest.length);
  return { node: { type: 'table', align: aligns as TableAlign[], header: header.map(cell), rows }, length };
}

/** Block-level constructs that only start at the beginning of a line. */
function parseBlock(rest: string): { node: MarkdownNode; length: number } | null {
  const heading = /^(#{1,3}) +([^\n]*\S)[ \t]*(?:\n|$)/.exec(rest);
  if (heading) {
    return { node: { type: 'heading', level: heading[1]!.length as 1 | 2 | 3, children: parseMarkdown(heading[2]!) }, length: heading[0].length };
  }
  const sub = /^-# +([^\n]*\S)[ \t]*(?:\n|$)/.exec(rest);
  if (sub) return { node: { type: 'subtext', children: parseMarkdown(sub[1]!) }, length: sub[0].length };

  if (rest.startsWith('>>> ')) {
    return { node: { type: 'quote', children: parseMarkdown(rest.slice(4)) }, length: rest.length };
  }
  if (rest.startsWith('> ')) {
    const lines: string[] = [];
    let length = 0;
    for (const line of rest.split('\n')) {
      if (!line.startsWith('> ')) break;
      lines.push(line.slice(2));
      length += line.length + 1;
    }
    return { node: { type: 'quote', children: parseMarkdown(lines.join('\n')) }, length: Math.min(length, rest.length) };
  }

  if (LIST_LINE.test(rest.split('\n', 1)[0]!)) {
    const lines: ListLine[] = [];
    for (const line of rest.split('\n')) {
      const m = LIST_LINE.exec(line);
      if (!m) break;
      lines.push({ indent: m[1]!.length, ordered: m[3] !== undefined, number: m[3] ? Number(m[3]) : 1, content: m[4]! });
    }
    const base = Math.min(...lines.map((l) => l.indent));
    const normalised = lines.map((l) => ({ ...l, indent: l.indent === base ? base : Math.max(l.indent, base + 1) }));
    const built = buildList(normalised, 0, base);
    const used = rest.split('\n').slice(0, built.next).join('\n').length;
    return { node: built.node, length: Math.min(used + 1, rest.length) };
  }
  return parseTable(rest);
}

const RULES: Rule[] = [
  {
    pattern: /^```(?:([\w+#-]+)\n)?\n?([\s\S]*?)\n?```/,
    build: (m) => ({ type: 'codeblock', lang: m[1] ?? null, text: m[2] ?? '' }),
  },
  { pattern: /^`([^`]+)`/, build: (m) => ({ type: 'code', text: m[1] ?? '' }) },
  { pattern: /^<@&(\d+)>/, build: (m) => ({ type: 'roleMention', id: m[1]! }) },
  { pattern: /^<@!?(\d+)>/, build: (m) => ({ type: 'userMention', id: m[1]! }) },
  { pattern: /^<#(\d+)>/, build: (m) => ({ type: 'channelMention', id: m[1]! }) },
  {
    pattern: /^<(a?):(\w{2,32}):(\d+)>/,
    build: (m) => ({ type: 'customEmoji', animated: m[1] === 'a', name: m[2]!, id: m[3]! }),
  },
  {
    pattern: /^<t:(-?\d{1,13})(?::([tTdDfFR]))?>/,
    build: (m) => ({ type: 'timestamp', unix: Number(m[1]), style: (m[2] ?? 'f') as TimestampStyle }),
  },
  {
    pattern: /^<(https?:\/\/[^\s<>]+)>/,
    build: (m) => ({ type: 'link', url: m[1]! }),
  },
  {
    pattern: /^\[([^\]\n]{1,300})\]\(<?(https?:\/\/[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)>?\)/,
    build: (m) => ({ type: 'link', url: m[2]!, label: stripLinks(parseMarkdown(m[1]!)) }),
  },
  { pattern: /^@(everyone|here)\b/, build: (m) => ({ type: 'everyone', kind: m[1] as 'everyone' | 'here' }) },
  {
    pattern: /^https?:\/\/[^\s<]*[^\s<.,:;"')\]!?]/,
    build: (m) => ({ type: 'link', url: m[0] }),
  },
  { pattern: /^\*\*([\s\S]+?)\*\*(?!\*)/, build: wrap('bold') },
  { pattern: /^__([\s\S]+?)__(?!_)/, build: wrap('underline') },
  { pattern: /^~~([\s\S]+?)~~/, build: wrap('strike') },
  { pattern: /^\|\|([\s\S]+?)\|\|/, build: wrap('spoiler') },
  { pattern: /^\*(?=\S)([\s\S]*?\S)\*(?!\*)/, build: wrap('italic') },
  { pattern: /^_(?=\S)([\s\S]*?\S)_(?!\w)/, build: wrap('italic') },
];

export function parseMarkdown(source: string): MarkdownNode[] {
  if (depth >= MAX_DEPTH) return source ? [{ type: 'text', text: source }] : [];
  depth += 1;
  try {
    return parseLevel(source);
  } finally {
    depth -= 1;
  }
}

function parseLevel(source: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let text = '';
  let i = 0;
  const flush = () => {
    if (text) nodes.push({ type: 'text', text });
    text = '';
  };

  while (i < source.length) {
    const rest = source.slice(i);
    const atLineStart = i === 0 || source[i - 1] === '\n';
    const previous = source[i - 1];
    let matched = false;
    const escaped = /^\\([!-/:-@[-`{-~])/.exec(rest);
    if (escaped) {
      text += escaped[1];
      i += 2;
      continue;
    }
    if (atLineStart && !rest.startsWith('```')) {
      const block = parseBlock(rest);
      if (block) {
        flush();
        nodes.push(block.node);
        i += block.length;
        continue;
      }
    }
    for (const rule of RULES) {
      if (rule.lineStart && !atLineStart) continue;
      if (rule.pattern.source.startsWith('^_') && previous && /\w/.test(previous)) continue;
      const m = rule.pattern.exec(rest);
      if (m) {
        flush();
        nodes.push(rule.build(m));
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      text += source[i];
      i += 1;
    }
  }
  flush();
  return nodes;
}

export function extractMentionedUserIds(source: string): string[] {
  const ids = new Set<string>();
  for (const m of source.matchAll(/<@!?(\d+)>/g)) ids.add(m[1]!);
  return [...ids];
}

/** Plain-text rendering for notifications, previews and the palette. */
export function toPlainText(nodes: readonly MarkdownNode[], resolve: (node: MarkdownNode) => string | null = () => null): string {
  return nodes
    .map((n) => {
      const resolved = resolve(n);
      if (resolved !== null) return resolved;
      switch (n.type) {
        case 'text':
        case 'code':
        case 'codeblock':
          return n.text;
        case 'link':
          return n.label ? toPlainText(n.label, resolve) : n.url;
        case 'timestamp':
          return new Date(n.unix * 1000).toLocaleString();
        case 'table':
          return [n.header, ...n.rows].map((row) => row.map((c) => toPlainText(c, resolve)).join('\t')).join('\n');
        case 'list':
          return n.items.map((item) => `• ${toPlainText(item, resolve)}`).join('\n');
        case 'customEmoji':
          return `:${n.name}:`;
        case 'everyone':
          return `@${n.kind}`;
        case 'spoiler':
          return '▒▒▒▒';
        case 'userMention':
        case 'roleMention':
        case 'channelMention':
          return '@…';
        default:
          return toPlainText(n.children, resolve);
      }
    })
    .join('');
}
