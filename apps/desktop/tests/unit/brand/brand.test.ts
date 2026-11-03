import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND } from '../../../src/shared/brand';

const root = join(__dirname, '..', '..', '..');
const srcDir = join(root, 'src');
const ALLOWED = new Set(['shared/brand.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('brand module', () => {
  it('exposes every brand field as a non-empty string', () => {
    for (const key of ['displayName', 'productName', 'shortName', 'appId', 'protocolScheme', 'description', 'publisher', 'updateFeedHost', 'baseDomain', 'landingUrl', 'apiUrl', 'gatewayUrl', 'cdnUrl'] as const) {
      expect(typeof BRAND[key]).toBe('string');
      expect(BRAND[key].length).toBeGreaterThan(0);
    }
  });

  it('has a lowercase protocol scheme valid for deep links', () => {
    expect(BRAND.protocolScheme).toMatch(/^[a-z][a-z0-9+.-]*$/);
  });

  it('does not hardcode the product name in src outside the brand files', () => {
    const name = new RegExp(`(?<![A-Za-z@/-])${BRAND.displayName}(?![A-Za-z])`);
    const offenders = walk(srcDir)
      .filter((f) => /\.(ts|tsx|html|css|json)$/.test(f))
      .filter((f) => !ALLOWED.has(relative(srcDir, f).split(sep).join('/')))
      .filter((f) => name.test(readFileSync(f, 'utf8')))
      .map((f) => relative(srcDir, f));
    expect(offenders).toEqual([]);
  });

  it('does not hardcode the brand domain in src outside the brand files', () => {
    const offenders = walk(srcDir)
      .filter((f) => /\.(ts|tsx|html|css|json)$/.test(f))
      .filter((f) => !ALLOWED.has(relative(srcDir, f).split(sep).join('/')))
      .filter((f) => readFileSync(f, 'utf8').includes(BRAND.baseDomain))
      .map((f) => relative(srcDir, f));
    expect(offenders).toEqual([]);
  });
});
