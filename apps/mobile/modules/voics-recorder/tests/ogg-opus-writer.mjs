// macOS: compile the actual Swift writer, inspect pages and optionally decode with ffmpeg.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'voics-ogg-'));
try {
  const binary = join(dir, 'writer');
  execFileSync('swiftc', [join(here, '../ios/OggOpusWriter.swift'), join(here, '../ios/OggOpusReader.swift'), join(here, 'OggOpusWriterFixture.swift'), '-o', binary]);
  const file = execFileSync(binary);
  let offset = 0; const pages = [];
  while (offset < file.length) {
    assert.equal(file.subarray(offset, offset + 4).toString(), 'OggS');
    const count = file[offset + 26];
    const payload = [...file.subarray(offset + 27, offset + 27 + count)].reduce((a, b) => a + b, 0);
    const page = Buffer.from(file.subarray(offset, offset + 27 + count + payload));
    const expected = page.readUInt32LE(22); page.writeUInt32LE(0, 22);
    let crc = 0;
    for (const byte of page) { crc = (crc ^ (byte << 24)) >>> 0; for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x80000000) ? 0x04c11db7 : 0)) >>> 0; }
    assert.equal(crc, expected);
    pages.push({ flags: page[5], granule: page.readBigUInt64LE(6), sequence: page.readUInt32LE(18), payload: page.subarray(27 + count) });
    offset += page.length;
  }
  assert.equal(pages.length, 4);
  assert.deepEqual(pages.map((p) => p.sequence), [0, 1, 2, 3]);
  assert.equal(pages[0].payload.subarray(0, 8).toString(), 'OpusHead');
  assert.equal(pages[0].payload.readUInt16LE(10), 312);
  assert.equal(pages[1].payload.subarray(0, 8).toString(), 'OpusTags');
  assert.equal(pages[3].flags, 4);
  assert.equal(pages[3].granule, 1800n);
  const playback = join(dir, 'playback');
  execFileSync('swiftc', [join(here, '../ios/OggOpusWriter.swift'), join(here, '../ios/OggOpusReader.swift'), join(here, '../ios/OggOpusPlayback.swift'), join(here, 'OggOpusPlaybackFixture.swift'), '-o', playback]);
  execFileSync(playback, { stdio: 'inherit' });
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (probe.status === 0) {
    const path = join(dir, 'fixture.ogg'); writeFileSync(path, file);
    execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'null', '-'], { stdio: 'inherit' });
  } else console.log('ffmpeg unavailable: page checks passed; decode not tested');
  console.log('Ogg page, CRC, pre-skip and final granule checks passed');
} finally { rmSync(dir, { recursive: true, force: true }); }
