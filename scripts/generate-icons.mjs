// Generates the app icon (PNG + ICO + ICNS-free) from code so the repo carries no opaque binary source.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'desktop');

function crc32(buf) {
  let c;
  const table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// V geometry in unit coordinates; website/src/assets/logo.svg uses the same numbers on a 512 grid.
const V = { left: [0.28, 0.29], right: [0.72, 0.29], tip: [0.5, 0.72], halfWidth: 0.085 };

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22;
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      // Rounded square with an indigo-to-violet diagonal gradient.
      const dx = Math.max(Math.abs(x - size / 2) - (size / 2 - r), 0);
      const dy = Math.max(Math.abs(y - size / 2) - (size / 2 - r), 0);
      const dist = Math.hypot(dx, dy);
      const inside = dist <= r ? Math.min(1, r - dist) : 0;
      const t = (x + y) / (2 * size);
      // Bold "V": two round-capped strokes meeting at the bottom point, antialiased by distance.
      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;
      const d = Math.min(segmentDistance(px, py, V.left, V.tip), segmentDistance(px, py, V.right, V.tip));
      const coverage = Math.max(0, Math.min(1, 0.5 - (d - V.halfWidth) * size));
      const base = [96 + 80 * t, 84 + 20 * t, 232 - 40 * t];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = base[0] + (250 - base[0]) * coverage;
      raw[o + 1] = base[1] + (250 - base[1]) * coverage;
      raw[o + 2] = base[2] + (255 - base[2]) * coverage;
      raw[o + 3] = Math.round(255 * inside);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function ico(sizes) {
  const images = sizes.map((s) => ({ s, data: png(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ s, data }) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s;
    e[1] = s >= 256 ? 0 : s;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

mkdirSync(join(root, 'resources'), { recursive: true });
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'resources', 'icon.png'), png(512));
writeFileSync(join(root, 'build', 'icon.png'), png(512));
writeFileSync(join(root, 'build', 'icon.ico'), ico([16, 32, 48, 64, 128, 256]));
console.log('icons written');
