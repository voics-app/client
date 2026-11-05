/**
 * UTF-8 without TextEncoder or TextDecoder: the Hermes engine of the mobile app does not guarantee both,
 * and the private message payloads (base64 of UTF-8 JSON) must encode the same bytes on every platform.
 * Decoding follows the WHATWG algorithm TextDecoder uses by default: malformed input becomes U+FFFD.
 */

export function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0)!;
    // A lone surrogate cannot be encoded; TextEncoder writes U+FFFD for it.
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(bytes);
}

const REPLACEMENT = '�';

interface Lead {
  /** Continuation bytes still needed after the lead byte. */
  needed: number;
  /** Bits carried by the lead byte. */
  bits: number;
  /** Allowed range of the first continuation byte (narrower than 80..BF for overlongs, surrogates and > U+10FFFF). */
  lower: number;
  upper: number;
}

function lead(byte: number): Lead | null {
  if (byte >= 0xc2 && byte <= 0xdf) return { needed: 1, bits: byte & 0x1f, lower: 0x80, upper: 0xbf };
  if (byte >= 0xe0 && byte <= 0xef) {
    return { needed: 2, bits: byte & 0x0f, lower: byte === 0xe0 ? 0xa0 : 0x80, upper: byte === 0xed ? 0x9f : 0xbf };
  }
  if (byte >= 0xf0 && byte <= 0xf4) {
    return { needed: 3, bits: byte & 0x07, lower: byte === 0xf0 ? 0x90 : 0x80, upper: byte === 0xf4 ? 0x8f : 0xbf };
  }
  return null;
}

export function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const first = bytes[i]!;
    i += 1;
    if (first < 0x80) {
      out += String.fromCharCode(first);
      continue;
    }
    const sequence = lead(first);
    if (!sequence) {
      out += REPLACEMENT;
      continue;
    }
    let code = sequence.bits;
    let lower = sequence.lower;
    let upper = sequence.upper;
    let complete = true;
    for (let n = 0; n < sequence.needed; n++) {
      const next = bytes[i];
      if (next === undefined || next < lower || next > upper) {
        // The offending byte is not consumed: it starts the next sequence.
        complete = false;
        break;
      }
      code = (code << 6) | (next & 0x3f);
      lower = 0x80;
      upper = 0xbf;
      i += 1;
    }
    out += complete ? String.fromCodePoint(code) : REPLACEMENT;
  }
  return out;
}
