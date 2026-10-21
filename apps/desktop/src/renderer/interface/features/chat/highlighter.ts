import type { HLJSApi } from 'highlight.js';
import { parseHighlightHtml, type HighlightNode } from '@renderer/domain/highlightHtml';

/** Language name (as typed after the fence) -> loader. Each language is its own chunk, fetched on first use. */
const LOADERS: Record<string, () => Promise<{ default: Parameters<HLJSApi['registerLanguage']>[1] }>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  json: () => import('highlight.js/lib/languages/json'),
  python: () => import('highlight.js/lib/languages/python'),
  bash: () => import('highlight.js/lib/languages/bash'),
  shell: () => import('highlight.js/lib/languages/shell'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  css: () => import('highlight.js/lib/languages/css'),
  xml: () => import('highlight.js/lib/languages/xml'),
  sql: () => import('highlight.js/lib/languages/sql'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  rust: () => import('highlight.js/lib/languages/rust'),
  go: () => import('highlight.js/lib/languages/go'),
  java: () => import('highlight.js/lib/languages/java'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  c: () => import('highlight.js/lib/languages/c'),
  diff: () => import('highlight.js/lib/languages/diff'),
  php: () => import('highlight.js/lib/languages/php'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  swift: () => import('highlight.js/lib/languages/swift'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  ini: () => import('highlight.js/lib/languages/ini'),
};

const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', python3: 'python',
  sh: 'bash', zsh: 'bash', console: 'shell',
  ps1: 'powershell', pwsh: 'powershell',
  html: 'xml', svg: 'xml', xhtml: 'xml',
  yml: 'yaml', md: 'markdown',
  rs: 'rust', golang: 'go',
  cs: 'csharp', 'c#': 'csharp', 'c++': 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  patch: 'diff', rb: 'ruby', kt: 'kotlin',
  docker: 'dockerfile', toml: 'ini',
};

export function resolveLanguage(lang: string | null): string | null {
  if (!lang) return null;
  const key = lang.toLowerCase();
  const name = ALIASES[key] ?? key;
  return name in LOADERS ? name : null;
}

let core: Promise<HLJSApi> | null = null;
const loaded = new Map<string, Promise<void>>();

function loadCore(): Promise<HLJSApi> {
  core ??= import('highlight.js/lib/core').then((m) => m.default);
  return core;
}

/** Highlights `code` as a tree of text and classed spans, or null when the language is unknown. */
export async function highlightCode(code: string, lang: string | null): Promise<HighlightNode[] | null> {
  const name = resolveLanguage(lang);
  if (!name) return null;
  const hljs = await loadCore();
  let pending = loaded.get(name);
  if (!pending) {
    pending = LOADERS[name]!().then((m) => hljs.registerLanguage(name, m.default));
    loaded.set(name, pending);
  }
  await pending;
  return parseHighlightHtml(hljs.highlight(code, { language: name, ignoreIllegals: true }).value);
}
