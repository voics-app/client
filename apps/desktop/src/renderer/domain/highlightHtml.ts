/**
 * highlight.js returns an HTML string. Rather than injecting it, this reads the tiny subset it emits
 * (`<span class="hljs-*">` and escaped text) into a tree the renderer turns into React nodes.
 */
export type HighlightNode = string | { className: string; children: HighlightNode[] };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" };

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, name: string) => ENTITIES[name] ?? '');
}

export function parseHighlightHtml(html: string): HighlightNode[] {
  const root: HighlightNode[] = [];
  const stack: Array<{ className: string; children: HighlightNode[] }> = [];
  const current = () => stack[stack.length - 1]?.children ?? root;
  const re = /<span class="([A-Za-z0-9_ -]*)">|<\/span>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      const node = { className: m[1], children: [] as HighlightNode[] };
      current().push(node);
      stack.push(node);
    } else if (m[0] === '</span>') {
      stack.pop();
    } else if (m[2] !== undefined) {
      current().push(decode(m[2]));
    } else {
      current().push('<');
    }
  }
  return root;
}
