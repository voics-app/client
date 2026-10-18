import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../../src/main/csp';
import { PROFILES } from '../../../src/main/config';

describe('buildCsp', () => {
  it('allows only configured endpoints and voice hosts in production', () => {
    const csp = buildCsp(PROFILES.production, null);
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain('https://discordy-api.voics.nl');
    expect(csp).toContain('wss://discordy-gateway.voics.nl');
    expect(csp).toContain('wss://*.voics.nl');
    expect(csp).not.toContain('localhost');
    expect(csp).toContain("object-src 'none'");
  });

  it('opens localhost for the local profile', () => {
    expect(buildCsp(PROFILES.local, null)).toContain('ws://localhost:*');
  });
});
