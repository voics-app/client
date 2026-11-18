/** Candidate inventory, not a translated-percentage score: names, examples and protocol text need review. */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const ts = require('typescript');
const root = fileURLToPath(new URL('..', import.meta.url));
const inputs = process.argv.slice(2).filter((arg) => arg !== '--json');
const paths = inputs.length ? inputs.map((input) => resolve(root, input)) : [resolve(root, 'apps/desktop/src/renderer/interface')];
const files = [];
function walk(path) {
  if (/\.[cm]?[jt]sx?$/.test(path)) { files.push(path); return; }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (/\.[jt]sx?$/.test(entry.name)) files.push(child);
  }
}
paths.forEach(walk);
const candidates = [];
const attrs = new Set(['title', 'label', 'placeholder', 'description', 'hint', 'sub', 'alt', 'aria-label', 'body']);
for (const file of files.sort()) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    let value;
    let kind;
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text)) { value = node.text.replace(/\s+/g, ' ').trim(); kind = 'visible text'; }
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      if (ts.isJsxAttribute(parent) && parent.name.text === 'searchKey') return;
      if (ts.isJsxAttribute(parent) && attrs.has(parent.name.text) && /[A-Za-z]/.test(node.text)) { value = node.text; kind = 'label'; }
      else if (ts.isPropertyAssignment(parent) && ['label', 'title', 'description', 'body', 'hint'].includes(parent.name.getText(source)) && /[A-Za-z]/.test(node.text)) { value = node.text; kind = 'copy object'; }
      else if (/^[A-Z][a-z]+(?:[ -][A-Za-z])/.test(node.text) && !ts.isImportDeclaration(parent) && !(ts.isCallExpression(parent) && /^(t|msg)$|\.t$/.test(parent.expression.getText(source)))) { value = node.text; kind = 'possible message'; }
    }
    else if (ts.isTemplateExpression(node) && /[A-Za-z]{3}/.test(node.head.text)) { value = node.getText(source); kind = 'dynamic copy candidate'; }
    if (value) candidates.push({ file: relative(root, file).replaceAll('\\', '/'), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, text: value });
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(candidates, null, 2) + '\n');
else {
  const counts = new Map();
  for (const item of candidates) counts.set(item.file, (counts.get(item.file) ?? 0) + 1);
  process.stdout.write('Review candidates (includes examples and protocol text; excludes dynamic/domain/native copy):\n');
  for (const [file, count] of [...counts].sort((a, b) => b[1] - a[1])) process.stdout.write(`${count}\t${file}\n`);
  process.stdout.write(`Total: ${candidates.length} candidates in ${counts.size} files\n`);
}
