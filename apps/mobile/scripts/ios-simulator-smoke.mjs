#!/usr/bin/env node
/** Native startup/navigation proof on an existing disposable CI simulator. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.platform, 'darwin', 'Run on the macOS native CI runner');
assert(process.env.RUNNER_TEMP, 'RUNNER_TEMP is required');
const output = path.join(process.env.RUNNER_TEMP, 'voics-ios-smoke');
const app = path.join(process.env.RUNNER_TEMP, 'voics-ios/Build/Products/Debug-iphonesimulator/Voics.app');
assert(existsSync(app), 'Build the simulator app first');
mkdirSync(output, { recursive: true });
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 300_000 });
const simctl = (...args) => run('xcrun', ['simctl', ...args]);
const devices = JSON.parse(simctl('list', 'devices', 'available', '--json')).devices;
const device = Object.entries(devices).sort(([a], [b]) => b.localeCompare(a))
  .flatMap(([runtime, items]) => items.map((item) => ({ ...item, runtime })))
  .find((item) => item.isAvailable && item.name.startsWith('iPhone'));
assert(device, 'An available iPhone simulator must already exist on the CI runner');
writeFileSync(path.join(output, 'device.json'), JSON.stringify({ name: device.name, runtime: device.runtime, udid: device.udid }, null, 2));
const metroLog = openSync(path.join(output, 'metro.log'), 'w');
let metro;
try {
  if (device.state !== 'Booted') simctl('boot', device.udid);
  simctl('bootstatus', device.udid, '-b');
  simctl('install', device.udid, app);
  metro = spawn('pnpm', ['exec', 'expo', 'start', '--dev-client', '--localhost', '--port', '8081'], {
    env: { ...process.env, CI: '1', EXPO_NO_DEV_MENU: '1' },
    stdio: ['ignore', metroLog, metroLog],
    detached: true,
  });
  let started = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (metro.exitCode !== null) throw new Error(`Metro exited with ${metro.exitCode}`);
    try {
      const response = await fetch('http://127.0.0.1:8081/status', { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.text()).includes('packager-status:running')) {
        started = true;
        break;
      }
    } catch { /* The local server is still starting. */ }
    await delay(500);
  }
  assert(started, 'Metro did not become ready within 90 seconds');
  const url = new URL('voics://');
  url.searchParams.set('__expo_url', 'http://127.0.0.1:8081');
  for (const flag of ['onboarding', 'fab', 'auto_launch']) url.searchParams.set(`__expo_disable_${flag}`, '1');
  simctl('openurl', device.udid, url.href);
  process.stdout.write(run('maestro', ['--device', device.udid, 'test', '--debug-output', path.join(output, 'maestro'), '-e', `SMOKE_OUTPUT=${output}`, 'e2e/ios-startup.yml']));
  console.log('Native iOS app startup and sign-in/register/reset navigation passed.');
} finally {
  try { simctl('io', device.udid, 'screenshot', path.join(output, 'final.png')); } catch { /* Keep the primary failure. */ }
  if (metro?.pid) {
    try { process.kill(-metro.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  }
  closeSync(metroLog);
  if (device.state !== 'Booted') {
    try { simctl('shutdown', device.udid); } catch { /* Runner disposal cleans up. */ }
  }
}
