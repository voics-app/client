// Count the entry and its static imports, excluding on-demand chunks and workers.
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RENDERER_BUDGET_BYTES = 2_800_000;

export async function measureInitialJs(root, log = console.log) {
  const manifest = JSON.parse(await readFile(resolve(root, '.vite/manifest.json'), 'utf8'));
  const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  if (entries.length !== 1) throw new Error(`Expected one renderer entry, found ${entries.length}`);
  const seen = new Set();
  async function visit(key) {
    if (seen.has(key)) return 0;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
    let bytes = 0;
    if (chunk.file.endsWith('.js')) {
      bytes = (await stat(resolve(root, chunk.file))).size;
      log(`${chunk.file}: ${bytes} bytes`);
    }
    for (const dependency of chunk.imports ?? []) bytes += await visit(dependency);
    return bytes;
  }
  return visit(entries[0]);
}

export async function checkRendererBudget(root, budget = RENDERER_BUDGET_BYTES, log = console.log) {
  const bytes = await measureInitialJs(root, log);
  log(`Initial renderer JS: ${bytes} bytes (budget ${budget} bytes)`);
  if (bytes > budget) throw new Error(`Initial renderer JS exceeds the ${budget}-byte budget`);
  return bytes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../out/renderer');
  await checkRendererBudget(root);
}
