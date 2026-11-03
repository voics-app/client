import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: class {}, app: {}, nativeTheme: {}, session: {}, shell: {} }));

import { withDevServerCors } from '../../../src/main/window';

describe('dev server CORS', () => {
  it('replaces the server allow-origin (any case) with the dev origin and keeps other headers', () => {
    const out = withDevServerCors(
      { 'access-control-allow-origin': ['null'], 'Content-Type': ['application/json'] },
      'http://localhost:5173/',
    );
    expect(out).toEqual({ 'Content-Type': ['application/json'], 'Access-Control-Allow-Origin': ['http://localhost:5173'] });
  });

  it('adds the header when the server sent none (disallowed origin preflight)', () => {
    expect(withDevServerCors(undefined, 'http://localhost:5173')).toEqual({ 'Access-Control-Allow-Origin': ['http://localhost:5173'] });
  });
});
