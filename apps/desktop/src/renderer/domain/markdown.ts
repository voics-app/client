/** Discord-flavoured markdown parser producing a renderer-agnostic AST. */

export type MarkdownNode =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler' | 'quote'; children: MarkdownNode[] }
  | { type: 'code'; text: string }
  | { type: 'codeblock'; lang: string | null; text: string }
  | { type: 'userMention' | 'roleMention' | 'channelMention'; id: string }
  | { type: 'customEmoji'; name: string; id: string; animated: boolean }
  | { type: 'everyone'; kind: 'everyone' | 'here' }
  | { type: 'link'; url: string };

type Rule = {
  pattern: RegExp;
  lineStart?: boolean;
  build: (m: RegExpExecArray) => MarkdownNode;
};

const wrap =
  (type: 'bold' | 'italic' | 'underline' | 'strike' | 'spoiler' | 'quote') =>
  (m: RegExpExecArray): MarkdownNode => ({ type, children: parseMarkdown(m[1] ?? '') });

const RULES: Rule[] = [
  {
    pattern: /^```(?:([\w+#-]+)\n)?\n?([\s\S]*?)\n?```/,
    build: (m) => ({ type: 'codeblock', lang: m[1] ?? null, text: m[2] ?? '' }),
  },
  { pattern: /^`([^`]+)`/, build: (m) => ({ type: 'code', text: m[1] ?? '' }) },
  { pattern: /^> ([^\n]*)/, lineStart: true, build: wrap('quote') },
  { pattern: /^<@&(\d+)>/, build: (m) => ({ type: 'roleMention', id: m[1]! }) },
  { pattern: /^<@!?(\d+)>/, build: (m) => ({ type: 'userMention', id: m[1]! }) },
  { pattern: /^<#(\d+)>/, build: (m) => ({ type: 'channelMention', id: m[1]! }) },
  {
    pattern: /^<(a?):(\w{2,32}):(\d+)>/,
    build: (m) => ({ type: 'customEmoji', animated: m[1] === 'a', name: m[2]!, id: m[3]! }),
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
          return n.url;
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
