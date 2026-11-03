// `pnpm dev2`: a second dev instance next to `pnpm dev`, for testing two accounts against each other.
// Own renderer port (5174) and own userData folder, so it has its own login, settings, E2EE keys and
// single-instance lock. Override with RENDERER_PORT / DISCORDY_USER_DATA_DIR.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = {
  ...process.env,
  RENDERER_PORT: process.env.RENDERER_PORT || '5174',
  DISCORDY_USER_DATA_DIR: process.env.DISCORDY_USER_DATA_DIR || join(tmpdir(), 'discordy-dev2'),
};
console.log(`dev2: renderer port ${env.RENDERER_PORT}, user data ${env.DISCORDY_USER_DATA_DIR}`);
const child = spawn('electron-vite', ['dev', ...process.argv.slice(2)], { env, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
