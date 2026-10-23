import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../../src/renderer/interface/shared/theme/app.css'), 'utf8');

describe('title bar drag regions (client#157)', () => {
  it('makes the empty end cell draggable while its buttons stay clickable', () => {
    expect(css).toMatch(/\.titlebar > \.titlebar-end \{ -webkit-app-region: drag; \}/);
    expect(css).toMatch(/\.titlebar-end > \* \{ -webkit-app-region: no-drag; \}/);
    expect(css).toMatch(/\.titlebar > \* \{ -webkit-app-region: no-drag; \}/);
  });
});
