import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const nsh = readFileSync(join(__dirname, '../../../build/installer.nsh'), 'utf8');
const backslash = String.fromCharCode(92);

describe('installer.nsh', () => {
  it('removes the link registration from its real registry path', () => {
    const key = ['Software', 'Classes', '$' + '{APP_PROTOCOL}'].join(backslash);
    expect(nsh).toContain(`DeleteRegKey HKCU "${key}"`);
  });
});
