// Run on macOS with Swift and Node. No third-party packages or network are needed.
import { createDecipheriv, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'voics-cipher-'));
try {
  const executable = join(dir, 'test');
  execFileSync('swiftc', [join(here, '../ios/AttachmentCipher.swift'), join(here, 'AttachmentCipherInterop.swift'), '-o', executable], { stdio: 'inherit' });
  const result = JSON.parse(execFileSync(executable, { encoding: 'utf8' }));
  const data = Buffer.from(result.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(result.key_b64, 'base64'), Buffer.from(result.nonce_b64, 'base64'));
  decipher.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
  assert.equal(plain.toString(), 'voics-opus-fixture');
  assert.equal(createHash('sha256').update(plain).digest('base64'), result.sha256_b64);
  console.log('CryptoKit/Node AES-GCM interoperability and tamper checks passed');
} finally { rmSync(dir, { recursive: true, force: true }); }
