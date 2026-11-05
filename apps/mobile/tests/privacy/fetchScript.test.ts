/* eslint-disable @typescript-eslint/no-require-imports -- the script runs in a child Node process; the app has no Node typings */
const { spawnSync } = require('child_process') as { spawnSync(command: string, args: string[], options: object): { status: number | null; stdout: string; stderr: string } };
const path = require('path') as { join(...parts: string[]): string };

const script = path.join(process.cwd(), 'scripts', 'fetch-crypto-framework.mjs');
const run = (env: Record<string, string>) => spawnSync(process.execPath, [script], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } });

describe('fetch-crypto-framework', () => {
  it('does nothing for an Android build', () => {
    const result = run({ EAS_BUILD_PLATFORM: 'android' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('not needed for android');
  });

  it('stops with a plain message when no token is set for an iOS build', () => {
    const result = run({ EAS_BUILD_PLATFORM: 'ios' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VOICS_CRYPTO_GITHUB_TOKEN');
  });
});
