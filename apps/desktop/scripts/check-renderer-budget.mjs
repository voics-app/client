// Count the entry and its static imports, excluding on-demand chunks and workers.
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../out/renderer');
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
    console.log(`${chunk.file}: ${bytes} bytes`);
  }
  for (const dependency of chunk.imports ?? []) bytes += await visit(dependency);
  return bytes;
}
const bytes = await visit(entries[0]);
const budget = 3000000;
console.log(`Initial renderer JS: ${bytes} bytes (budget ${budget} bytes)`);
if (bytes > budget) process.exitCode = 1;
