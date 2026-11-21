// Native regression: composer growth and keyboard cycles must not cover the last message.
// Start in a disposable QA chat with a unique last text/link label and an empty draft.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [serial, lastLabel, outputDirectory] = process.argv.slice(2);
assert.ok(/^emulator-\d+$/.test(serial ?? ''), 'Pass the existing QA emulator serial');
assert.ok(lastLabel && outputDirectory, 'Usage: node scripts/android-keyboard-smoke.mjs emulator-5554 "Last link label" artifacts');
const packageId = 'nl.voics.app.qa';
const adb = process.env.ADB ?? 'adb';
const output = resolve(outputDirectory);
mkdirSync(output, { recursive: true });
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20_000 });
const pause = ms => new Promise(done => setTimeout(done, ms));
const decode = value => value.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
function focus() {
  const activity = run('shell', 'dumpsys', 'activity', 'activities').split('\n').find(line => line.includes('topResumedActivity')) ?? '';
  assert.ok(activity.includes(`${packageId}/`), 'The disposable Voics QA app must be foreground');
}
function snapshot() {
  focus();
  run('shell', 'uiautomator', 'dump', '/sdcard/voics-keyboard-smoke.xml');
  run('pull', '/sdcard/voics-keyboard-smoke.xml', resolve(output, 'window.xml'));
  const xml = readFileSync(resolve(output, 'window.xml'), 'utf8');
  return [...xml.matchAll(/<node\b([^>]+)>?/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], decode(item[2])]),
  ));
}
function bounds(node) {
  assert.ok(node?.bounds, 'Expected an inspected control');
  return node.bounds.match(/\d+/g).map(Number);
}
function input(nodes) {
  const result = nodes.find(node => node['content-desc'] === 'Message' && node.class === 'android.widget.EditText');
  assert.ok(result, 'Open a writable QA chat before running this check');
  return result;
}
async function replaceDraft(value) {
  const [left, top, right, bottom] = bounds(input(snapshot()));
  focus();
  const x = String(Math.round((left + right) / 2));
  const y = String(Math.round((top + bottom) / 2));
  // A real touch sequence with MOVE, rather than invoking a React callback.
  run('shell', 'input', 'swipe', x, y, x, y, '120');
  await pause(400);
  run('shell', 'input', 'keycombination', 'KEYCODE_CTRL_LEFT', 'KEYCODE_A');
  run('shell', 'input', 'keyevent', 'KEYCODE_DEL');
  snapshot(); // Let controlled TextInput acknowledge selection/deletion before typing.
  if (value) run('shell', 'input', 'text', value.replaceAll(' ', '%s'));
  await pause(400);
  if (value) assert.equal(input(snapshot()).text, value, 'Test input must match exactly');
}
async function dismissKeyboard() {
  focus();
  if (/mInputShown=true|isInputViewShown=true/.test(run('shell', 'dumpsys', 'input_method'))) {
    run('shell', 'input', 'keyevent', '4');
  }
  await pause(400);
}
const results = [];
function verify(step) {
  const nodes = snapshot();
  const last = nodes.find(node => node.text === lastLabel || node['content-desc'] === lastLabel);
  assert.ok(last, `Last message label must remain visible: ${lastLabel}`);
  const bottom = bounds(last)[3];
  const composerTop = bounds(input(nodes))[1];
  const result = { step, bottom, composerTop, visible: bottom < composerTop };
  results.push(result);
  assert.ok(result.visible, `${step}: last message ends at ${bottom}, composer begins at ${composerTop}`);
  console.log(JSON.stringify(result));
}
try {
  verify('initial');
  const long = 'Keyboard growth check with several words repeated to expand the composer across multiple lines and keep the newest message visible above the input field';
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    await replaceDraft(long);
    verify(`cycle ${cycle}: expanded with keyboard`);
    await dismissKeyboard();
    verify(`cycle ${cycle}: expanded without keyboard`);
    await replaceDraft('Short QA');
    verify(`cycle ${cycle}: shrunk with keyboard`);
    await dismissKeyboard();
    verify(`cycle ${cycle}: shrunk without keyboard`);
  }
} finally {
  writeFileSync(resolve(output, 'results.json'), JSON.stringify({ at: new Date().toISOString(), serial, packageId, results }, null, 2));
  focus();
  run('shell', 'screencap', '-p', '/sdcard/voics-keyboard-smoke.png');
  run('pull', '/sdcard/voics-keyboard-smoke.png', resolve(output, 'screen.png'));
}
