// Run on a runner with ffmpeg and ffprobe; compares the decoded samples as well
// as container headers so a timestamp/pre-skip regression cannot pass on magic bytes alone.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { remuxVoiceMessage } from '../src/renderer/interface/features/chat/remuxVoiceMessage.ts';

const dir = mkdtempSync(join(tmpdir(), 'voics-voice-remux-'));
const input = join(dir, 'known.webm');
const output = join(dir, 'result.ogg');
const run = (name, args) => execFileSync(name, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024, env: { ...process.env, SDL_AUDIODRIVER: 'dummy' } });
try {
  for (const duration of [0.11, 1.2, 1.2135, 2.347, 12.345]) {
    run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=523:sample_rate=48000:duration=${duration}`, '-c:a', 'libopus', '-y', input]);
    const source = readFileSync(input);
    const result = Buffer.from(await (await remuxVoiceMessage(new Blob([source], { type: 'audio/webm' }))).arrayBuffer());
    writeFileSync(output, result);
    assert.equal(result.subarray(0, 4).toString(), 'OggS');
    const srcHead = source.indexOf('OpusHead');
    const dstHead = result.indexOf('OpusHead');
    assert.ok(srcHead >= 0 && dstHead >= 0);
    assert.equal(result.readUInt16LE(dstHead + 10), source.readUInt16LE(srcHead + 10), 'Opus pre-skip changed');
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name', '-of', 'json', output]));
    assert.equal(probe.streams[0].codec_name, 'opus');
    assert.ok(Math.abs(Number(probe.format.duration) - duration) < 0.05, 'duration changed');
    const decode = (path) => run('ffmpeg', ['-v', 'error', '-i', path, '-f', 's16le', '-acodec', 'pcm_s16le', '-']);
    const decodedOutput = decode(output);
    const decodedInput = decode(input);
    assert.ok(decodedOutput.equals(decodedInput), `decoded audio changed or shifted for ${duration}s (${decodedOutput.length} vs ${decodedInput.length} bytes)`);
    if (duration === 1.2) run('ffplay', ['-v', 'error', '-nodisp', '-autoexit', output]);
  }
  console.log('Ogg/Opus headers, pre-skip, duration and decoded samples verified for five recordings');
} finally { rmSync(dir, { recursive: true, force: true }); }
