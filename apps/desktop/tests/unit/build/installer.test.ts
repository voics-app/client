import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const nsh = readFileSync(join(__dirname, '../../../build/installer.nsh'), 'utf8');

describe('installer.nsh', () => {
  it('removes the link registration from its real registry path', () => {
    expect(nsh).toContain('DeleteRegKey HKCU "Software\Classes\${APP_PROTOCOL}"');
  });
});
