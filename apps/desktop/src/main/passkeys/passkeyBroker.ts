import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { PasskeyRequest, PasskeyResult, PasskeySite } from '../../shared/passkeys';
import { loopbackPage } from './loopbackPage';

const MAX_BYTES = 64 * 1024;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function validPasskeyRequest(value: unknown, site: PasskeySite): value is PasskeyRequest {
  if (!object(value) || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id)) return false;
  if (value.kind !== 'create' && value.kind !== 'get') return false;
  const key = value.publicKey;
  if (!object(key) || JSON.stringify(key).length > MAX_BYTES || typeof key.challenge !== 'string' || !/^[A-Za-z0-9_-]{16,1024}$/.test(key.challenge)) return false;
  return value.kind === 'create' ? object(key.rp) && key.rp.id === site.rpId : key.rpId === site.rpId;
}

function validResult(value: unknown, request: PasskeyRequest, site: PasskeySite): value is PasskeyResult {
  if (!object(value)) return false;
  if (value.ok === false) return ['cancelled', 'timeout', 'unavailable', 'failed'].includes(String(value.reason));
  if (value.ok !== true || !object(value.credential)) return false;
  const key = value.credential;
  if (key.type !== 'public-key' || typeof key.id !== 'string' || typeof key.rawId !== 'string' || !object(key.response) || typeof key.response.clientDataJSON !== 'string') return false;
  try {
    const data: unknown = JSON.parse(Buffer.from(key.response.clientDataJSON, 'base64url').toString('utf8'));
    return object(data) && data.type === `webauthn.${request.kind}` && data.origin === site.origin && data.challenge === request.publicKey.challenge && data.crossOrigin !== true;
  } catch { return false; }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk as Buffer);
    if (size > MAX_BYTES) throw new Error('Body too large');
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/** A single, short-lived, loopback-only browser handoff. The API still verifies the signature. */
export class PasskeyBroker {
  private active: { id: string; finish: (result: PasskeyResult) => void } | null = null;

  constructor(private readonly site: () => PasskeySite | null, private readonly open: (url: string) => Promise<void>, private readonly timeoutMs = 240_000) {}

  cancel(id?: string): void {
    if (this.active && (id === undefined || id === this.active.id)) this.active.finish({ ok: false, reason: 'cancelled' });
  }

  async perform(value: unknown): Promise<PasskeyResult> {
    const site = this.site();
    if (!site) return { ok: false, reason: 'unavailable' };
    if (!validPasskeyRequest(value, site)) throw new Error('Invalid passkey request');
    if (this.active) throw new Error('Another passkey request is already open');
    const request = value;
    const nonce = randomBytes(32).toString('base64url');
    let origin = '';
    let settled = false;
    let resolve!: (result: PasskeyResult) => void;
    const completion = new Promise<PasskeyResult>(r => { resolve = r; });
    const finish = (result: PasskeyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server?.close();
      server?.closeIdleConnections();
      if (this.active?.id === request.id) this.active = null;
      resolve(result);
    };
    this.active = { id: request.id, finish };
    const server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
      res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
      const reject = (code: number) => { res.writeHead(code); res.end(); };
      if (settled || req.headers.host !== new URL(origin).host) { reject(403); return; }
      if (req.method === 'GET' && req.url === '/') {
        // Cross-site fetches/iframes are unnecessary; a browser top-level navigation is the only entry.
        if (req.headers['sec-fetch-dest'] && req.headers['sec-fetch-dest'] !== 'document') { reject(403); return; }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(loopbackPage(site, request, nonce));
        return;
      }
      if (req.method !== 'POST' || req.url !== '/result') { reject(404); return; }
      if (req.headers.origin !== origin || req.headers['x-voics-ceremony'] !== nonce || req.headers['content-type'] !== 'application/json') { reject(403); return; }
      void readBody(req).then(result => {
        if (settled || !validResult(result, request, site)) { reject(400); return; }
        res.writeHead(204); res.end();
        finish(result);
      }).catch(() => reject(400));
    });
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), this.timeoutMs);
    server.on('error', () => finish({ ok: false, reason: 'failed' }));
    server.on('listening', () => { if (settled) server.close(); });
    const listening = new Promise<void>(ready => {
      server.once('error', () => ready());
      server.listen(0, '127.0.0.1', ready);
    });
    await Promise.race([listening, completion.then(() => undefined)]);
    const address = server.address();
    if (!address || typeof address === 'string' || settled) { finish({ ok: false, reason: 'failed' }); return completion; }
    origin = `http://127.0.0.1:${address.port}`;
    try { await this.open(`${origin}/`); } catch { finish({ ok: false, reason: 'unavailable' }); }
    return completion;
  }
}
