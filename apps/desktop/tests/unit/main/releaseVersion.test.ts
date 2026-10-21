import { describe, expect, it } from 'vitest';
import { compareVersions, nextVersion, publishedFromLatestYml } from '../../../../../scripts/release-version.mjs';

describe('release version', () => {
  it('uses the package version when nothing is published or it is newer', () => {
    expect(nextVersion({ base: '0.2.0', published: null })).toBe('0.2.0');
    expect(nextVersion({ base: '0.3.0', published: '0.2.5' })).toBe('0.3.0');
  });

  it('bumps the published patch when package.json was not bumped', () => {
    expect(nextVersion({ base: '0.2.0', published: '0.2.0' })).toBe('0.2.1');
    expect(nextVersion({ base: '0.2.0', published: '0.2.9' })).toBe('0.2.10');
  });

  it('compares numerically, not lexically', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(nextVersion({ base: '0.2.0', published: '0.10.3' })).toBe('0.10.4');
  });

  it('takes a tag verbatim and rejects one that is not newer than the feed', () => {
    expect(nextVersion({ base: '0.2.0', published: '0.2.0', tag: 'v0.4.0' })).toBe('0.4.0');
    expect(() => nextVersion({ base: '0.2.0', published: '0.4.0', tag: 'v0.4.0' })).toThrow(/not greater/);
    expect(() => nextVersion({ base: '0.2.0', published: null, tag: 'v1.2' })).toThrow(/X\.Y\.Z/);
  });

  it('reads the version out of latest.yml', () => {
    expect(publishedFromLatestYml('version: 0.2.0\nfiles:\n  - url: a.exe\n')).toBe('0.2.0');
    expect(publishedFromLatestYml("version: '1.0.3'\n")).toBe('1.0.3');
    expect(publishedFromLatestYml('<html>not found</html>')).toBeNull();
  });
});
