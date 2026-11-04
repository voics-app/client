/** Typed emoticons and the emoji they become. `:/` is left out on purpose: it is part of every URL scheme. */
const EMOTICONS: Record<string, string> = {
  ':)': '🙂', ':-)': '🙂', '(:': '🙂',
  ':(': '🙁', ':-(': '🙁',
  ":'(": '😢',
  ':D': '😄', ':-D': '😄', 'xD': '😆', 'XD': '😆',
  ';)': '😉', ';-)': '😉',
  ':P': '😛', ':p': '😛', ':-P': '😛',
  ':O': '😮', ':o': '😮',
  '<3': '❤️',
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMOTICON_RE = new RegExp(`(?<=^|\\s)(${Object.keys(EMOTICONS).sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?=$|\\s|[.,!?])`, 'g');
const CODE_RE = /(```[\s\S]*?```|`[^`\n]+`)/;

/** Replaces standalone emoticons with emoji. Code spans and fenced blocks are left alone. */
export function convertEmoticons(text: string): string {
  return text
    .split(CODE_RE)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(EMOTICON_RE, (m) => EMOTICONS[m] ?? m)))
    .join('');
}
