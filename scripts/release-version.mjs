// Decides which version a CI release build publishes (see .github/workflows/release.yml).
//
// electron-updater only offers an update when the feed's latest.yml carries a strictly higher semver,
// so every publish must be greater than what the feed serves now. Rules:
//   tag vX.Y.Z   -> exactly X.Y.Z; must be greater than the published version, otherwise fail.
//   main branch  -> the version in apps/desktop/package.json (bumped by the git-flow release branch)
//                   when that is greater than the published one, otherwise the published patch + 1.
//
// CLI:  node scripts/release-version.mjs --latest-yml <file> --print-published   (prints the feed's version)
//       node scripts/release-version.mjs --published <x.y.z|none> [--tag vX.Y.Z] [--apply]
// Prints the version; --apply also writes it into apps/desktop/package.json (CI workspace only).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(text) {
  const m = SEMVER.exec(String(text ?? '').trim().replace(/^v/, ''));
  if (!m) throw new Error(`not a plain X.Y.Z version: "${text}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** Version from latest.yml text (`version: 1.2.3`), or null when the feed is empty. */
export function publishedFromLatestYml(yml) {
  const m = /^version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(yml ?? '');
  return m ? m[1] : null;
}

/**
 * @param {{ base: string, published: string | null, tag?: string }} input
 * @returns {string}
 */
export function nextVersion({ base, published, tag }) {
  if (tag) {
    const version = parseVersion(tag).join('.');
    if (published && compareVersions(version, published) <= 0) {
      throw new Error(`tag ${tag}: version ${version} is not greater than the published ${published}; bump the tag`);
    }
    return version;
  }
  const baseVersion = parseVersion(base).join('.');
  if (!published || compareVersions(baseVersion, published) > 0) return baseVersion;
  const [major, minor, patch] = parseVersion(published);
  return `${major}.${minor}.${patch + 1}`;
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'desktop', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (argv.includes('--print-published')) {
    const published = publishedFromLatestYml(readFileSync(arg('--latest-yml'), 'utf8'));
    if (!published) throw new Error('latest.yml from the feed has no X.Y.Z version');
    console.log(published);
    return;
  }
  const publishedArg = arg('--published');
  if (!publishedArg) throw new Error('--published <x.y.z|none> is required');
  const published = publishedArg === 'none' ? null : parseVersion(publishedArg).join('.');
  const version = nextVersion({ base: pkg.version, published, tag: arg('--tag') || undefined });
  if (argv.includes('--apply')) {
    pkg.version = version;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  console.log(version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
