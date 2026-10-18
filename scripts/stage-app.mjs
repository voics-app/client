// Stages a self-contained app directory for electron-builder (two-package.json layout).
// The workspace uses pnpm's hoisted linker, which electron-builder's dependency collector cannot walk,
// so the packaged app gets its own small npm install of the real runtime dependencies.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'desktop');
const stage = join(desktop, 'stage');
const pkg = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
const brand = JSON.parse(readFileSync(join(desktop, 'brand.json'), 'utf8'));

if (!existsSync(join(desktop, 'out', 'main', 'index.js'))) throw new Error('run electron-vite build first');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(desktop, 'out'), join(stage, 'out'), { recursive: true, filter: (src) => !src.includes(`${join('out', 'tsc-node')}`) });
cpSync(join(desktop, 'resources'), join(stage, 'resources'), { recursive: true });

const runtime = {
  name: pkg.name,
  productName: brand.productName,
  version: pkg.version,
  description: brand.description,
  author: brand.publisher,
  homepage: pkg.homepage,
  license: pkg.license,
  main: pkg.main,
  dependencies: { 'electron-updater': pkg.dependencies['electron-updater'], '@discordy/crypto': 'file:../../../native/crypto' },
  optionalDependencies: pkg.optionalDependencies,
};
writeFileSync(join(stage, 'package.json'), `${JSON.stringify(runtime, null, 2)}\n`);
execFileSync('npm', ['install', '--omit=dev', '--install-links', '--no-audit', '--no-fund', '--ignore-scripts', '--no-package-lock'], { cwd: stage, stdio: 'inherit', shell: true });
console.log('staged', stage);
