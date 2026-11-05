#!/usr/bin/env node
/**
 * Downloads the iOS package of the crypto engine (XCFramework and Swift binding) that the crypto-ios workflow
 * built, and unpacks it into modules/voics-crypto/ios. Without it `pod install` fails for the VoicsCrypto pod.
 *
 * Runs as the EAS build hook `eas-build-pre-install` (iOS only) and by hand before `expo run:ios`:
 *   VOICS_CRYPTO_GITHUB_TOKEN=<token> node scripts/fetch-crypto-framework.mjs
 *
 * Environment:
 *   VOICS_CRYPTO_GITHUB_TOKEN   required; a token that can read Actions artifacts of the repository (EAS secret).
 *   VOICS_CRYPTO_BRANCH         branch whose newest artifact is used; default develop. Set it to test a feature branch.
 *   VOICS_CRYPTO_REPO           default discordy-voics/client.
 * The commit the artifact was built from is printed. The token is never printed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACT = 'voics-crypto-ios';
const REQUIRED = ['Frameworks/VoicsCryptoFFI.xcframework', 'Generated/voics_crypto.swift', 'Generated/voics_cryptoFFI.h', 'Generated/module.modulemap'];

const platform = process.env.EAS_BUILD_PLATFORM;
if (platform && platform !== 'ios') {
  console.log(`crypto framework: not needed for ${platform}`);
  process.exit(0);
}

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'modules', 'voics-crypto', 'ios');
if (REQUIRED.every((entry) => existsSync(join(target, entry)))) {
  console.log('crypto framework: already present');
  process.exit(0);
}

const token = process.env.VOICS_CRYPTO_GITHUB_TOKEN;
if (!token) {
  console.error('crypto framework: set VOICS_CRYPTO_GITHUB_TOKEN to a token that can read Actions artifacts of the repository.');
  process.exit(1);
}
const repo = process.env.VOICS_CRYPTO_REPO ?? 'discordy-voics/client';
const branch = process.env.VOICS_CRYPTO_BRANCH ?? 'develop';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

const list = await fetch(`https://api.github.com/repos/${repo}/actions/artifacts?name=${ARTIFACT}&per_page=30`, { headers });
if (!list.ok) {
  console.error(`crypto framework: listing artifacts failed (HTTP ${list.status}).`);
  process.exit(1);
}
const { artifacts } = await list.json();
const newest = artifacts.find((a) => !a.expired && a.workflow_run?.head_branch === branch);
if (!newest) {
  console.error(`crypto framework: no unexpired ${ARTIFACT} artifact for branch ${branch}. Run the crypto-ios workflow first (gh workflow run crypto-ios.yml --ref ${branch}).`);
  process.exit(1);
}
console.log(`crypto framework: artifact ${newest.id} built from ${newest.workflow_run.head_sha} on ${branch}`);

const download = await fetch(newest.archive_download_url, { headers });
if (!download.ok) {
  console.error(`crypto framework: download failed (HTTP ${download.status}).`);
  process.exit(1);
}
const scratch = join(tmpdir(), `voics-crypto-${process.pid}`);
mkdirSync(scratch, { recursive: true });
const zip = join(scratch, 'package.zip');
writeFileSync(zip, Buffer.from(await download.arrayBuffer()));
try {
  rmSync(join(target, 'Frameworks'), { recursive: true, force: true });
  rmSync(join(target, 'Generated'), { recursive: true, force: true });
  execFileSync('unzip', ['-q', '-o', zip, '-d', target], { stdio: 'inherit' });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
const missing = REQUIRED.filter((entry) => !existsSync(join(target, entry)));
if (missing.length > 0) {
  console.error(`crypto framework: the artifact is missing ${missing.join(', ')}.`);
  process.exit(1);
}
console.log('crypto framework: unpacked');
