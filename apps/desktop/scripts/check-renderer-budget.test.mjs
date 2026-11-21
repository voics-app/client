import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRendererBudget } from './check-renderer-budget.mjs';

test('counts transitive static imports once, excludes dynamic chunks, and enforces the limit', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'renderer-budget-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.vite'));
  await mkdir(join(root, 'assets'));
  const manifest = {
    'index.html': { isEntry: true, file: 'assets/entry.js', imports: ['shared', 'nested'], dynamicImports: ['lazy'] },
    shared: { file: 'assets/shared.js' },
    nested: { file: 'assets/nested.js', imports: ['shared'] },
    lazy: { file: 'assets/lazy.js' },
  };
  await writeFile(join(root, '.vite/manifest.json'), JSON.stringify(manifest));
  for (const [name, size] of [['entry', 4], ['shared', 3], ['nested', 2], ['lazy', 50]]) {
    await writeFile(join(root, `assets/${name}.js`), 'x'.repeat(size));
  }
  const lines = [];
  assert.equal(await checkRendererBudget(root, 9, (line) => lines.push(line)), 9);
  assert.equal(lines.filter((line) => line.includes('shared.js')).length, 1);
  assert.ok(!lines.some((line) => line.includes('lazy.js')));
  await assert.rejects(checkRendererBudget(root, 8, () => {}), /exceeds the 8-byte budget/);
});
