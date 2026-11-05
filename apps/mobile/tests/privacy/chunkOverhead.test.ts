/**
 * What react-native-webrtc's base64 bridge costs a P2P file transfer. RTCDataChannel.send and onmessage turn every
 * binary frame into base64 (base64-js) to cross the native bridge, so each 16 KiB chunk becomes 21,848 characters.
 * The size figures below are exact. The timings are measured on this machine under Node with the same library
 * (not on a phone, where Hermes is slower), so they only prove the cost is real and bounded, and are printed, not asserted.
 */
import { fromByteArray, toByteArray } from 'base64-js';
import { FILE_CHUNK_BYTES } from '@discordy/core/application/privacy/p2pService';

const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;

describe('the base64 bridge under 16 KiB file chunks', () => {
  it('expands every chunk by a third, exactly as the formula says', () => {
    const chunk = Uint8Array.from({ length: FILE_CHUNK_BYTES }, (_v, i) => (i * 7) & 0xff);
    const wire = fromByteArray(chunk);
    expect(FILE_CHUNK_BYTES).toBe(16384);
    expect(wire.length).toBe(21848);
    expect(wire.length).toBe(base64Length(FILE_CHUNK_BYTES));
    expect(wire.length / FILE_CHUNK_BYTES).toBeCloseTo(4 / 3, 3);
    expect(toByteArray(wire)).toEqual(chunk);
  });

  it('carries a 10 MB file as 640 chunks and about 14 MB over the bridge each way', () => {
    const file = 10 * 1024 * 1024;
    const chunks = Math.ceil(file / FILE_CHUNK_BYTES);
    const onBridge = chunks * base64Length(FILE_CHUNK_BYTES);
    expect(chunks).toBe(640);
    expect(onBridge).toBe(13_982_720);
    expect(onBridge / file).toBeCloseTo(1.333, 3);
  });

  it('measures the encode and decode time per chunk (printed, not asserted)', () => {
    const chunk = Uint8Array.from({ length: FILE_CHUNK_BYTES }, (_v, i) => (i * 13) & 0xff);
    const rounds = 2000;
    for (let i = 0; i < 200; i++) toByteArray(fromByteArray(chunk));
    const started = performance.now();
    for (let i = 0; i < rounds; i++) toByteArray(fromByteArray(chunk));
    const perChunkMs = (performance.now() - started) / rounds;
    const perFileMs = perChunkMs * 640;
    console.info(`base64 round trip of one 16 KiB chunk: ${perChunkMs.toFixed(4)} ms under Node; 10 MB file (640 chunks): ${perFileMs.toFixed(1)} ms of encode plus decode`);
    expect(Number.isFinite(perChunkMs)).toBe(true);
  });
});
