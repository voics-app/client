import { describe, expect, it, vi } from 'vitest';
import { ApiError, HttpClient } from '../../src/infrastructure/http/httpClient';

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function tokens(initial = 'old') {
  let access: string | null = initial;
  return {
    access: () => access,
    refresh: vi.fn(async () => {
      access = 'new';
      return 'new';
    }),
    expired: vi.fn(),
  };
}

describe('HttpClient', () => {
  it('returns binary bytes after the normal authentication retry', async () => {
    const t = tokens();
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new' ? new Response(new Uint8Array([1, 2, 3])) : json(401, { message: 'expired' });
    });
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: fetchFn as unknown as typeof fetch, tokens: t });
    const bytes = await client.request<ArrayBuffer>('GET', '/sound', { responseType: 'arrayBuffer' });
    expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3]);
    expect(t.refresh).toHaveBeenCalledOnce();
  });

  it('sends JSON with the bearer token to /api/v1', async () => {
    const fetchFn = vi.fn(async () => json(200, { ok: true }));
    const client = new HttpClient({ baseUrl: 'https://api.test/', fetch: fetchFn as unknown as typeof fetch, tokens: tokens() });
    await expect(client.request('POST', '/guilds', { body: { name: 'x' } })).resolves.toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/guilds');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer old');
    expect(init.body).toBe('{"name":"x"}');
  });

  it('serialises query parameters, skipping undefined', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => json(200, []));
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: fetchFn as unknown as typeof fetch, tokens: tokens() });
    await client.request('GET', '/channels/1/messages', { query: { before: '9', after: undefined, limit: 50 } });
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.test/api/v1/channels/1/messages?before=9&limit=50');
  });

  it('refreshes once on 401 and retries, sharing a single refresh across concurrent calls', async () => {
    const t = tokens();
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new' ? json(200, { ok: 1 }) : json(401, { code: 0, message: '401: Unauthorized' });
    });
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: fetchFn as unknown as typeof fetch, tokens: t });
    const results = await Promise.all([client.request('GET', '/users/@me'), client.request('GET', '/users/@me/settings')]);
    expect(results).toEqual([{ ok: 1 }, { ok: 1 }]);
    expect(t.refresh).toHaveBeenCalledTimes(1);
  });

  it('reports a non-JSON error response with its HTTP status', async () => {
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: async () => new Response('<html>413 Request Entity Too Large</html>', { status: 413 }), tokens: tokens() });
    const error = await client.request('PATCH', '/guilds/1', { body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(413);
    expect((error as ApiError).message).toBe('Request failed with HTTP 413');
  });

  it('keeps the session when the refresh fails because the server cannot be reached', async () => {
    const t = { access: () => 'old', refresh: vi.fn(async () => Promise.reject(new ApiError(0, 0, 'Network error'))), expired: vi.fn() };
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: (async () => json(401, {})) as unknown as typeof fetch, tokens: t });
    await expect(client.request('GET', '/x')).rejects.toBeInstanceOf(ApiError);
    expect(t.expired).not.toHaveBeenCalled();
  });

  it('keeps the session when the refresh fails with a server error', async () => {
    const t = { access: () => 'old', refresh: vi.fn(async () => Promise.reject(new ApiError(503, 0, 'down'))), expired: vi.fn() };
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: (async () => json(401, {})) as unknown as typeof fetch, tokens: t });
    await expect(client.renewSession()).resolves.toBe('unavailable');
    expect(t.expired).not.toHaveBeenCalled();
  });

  it('reports the session as expired when the server refuses the refresh token', async () => {
    const t = { access: () => 'old', refresh: vi.fn(async () => Promise.reject(new ApiError(401, 0, 'refused'))), expired: vi.fn() };
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: (async () => json(401, {})) as unknown as typeof fetch, tokens: t });
    await expect(client.request('GET', '/x')).rejects.toBeInstanceOf(ApiError);
    expect(t.expired).toHaveBeenCalledTimes(1);
  });

  it('reports an expired session when refresh fails', async () => {
    const t = { access: () => 'old', refresh: vi.fn(async () => null), expired: vi.fn() };
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: async () => json(401, { code: 0, message: 'no' }), tokens: t });
    await expect(client.request('GET', '/users/@me')).rejects.toBeInstanceOf(ApiError);
    expect(t.expired).toHaveBeenCalled();
  });

  it('waits and retries on 429 using Retry-After semantics', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? json(429, { code: 429, message: 'slow down', retry_after: 0.25 }) : json(200, { ok: true });
    });
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: fetchFn as unknown as typeof fetch, tokens: tokens() });
    const pending = client.request('GET', '/x');
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it('maps the error envelope to ApiError', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.test',
      fetch: async () => json(409, { code: 50160, message: 'Channel uses ephemeral delivery' }),
      tokens: tokens(),
    });
    const error = (await client.request('POST', '/channels/1/messages').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(409);
    expect(error.code).toBe(50160);
    expect(error.message).toMatch(/ephemeral/);
  });

  it('returns null for 204', async () => {
    const client = new HttpClient({ baseUrl: 'https://api.test', fetch: async () => new Response(null, { status: 204 }), tokens: tokens() });
    await expect(client.request('DELETE', '/x')).resolves.toBeNull();
  });

  it('surfaces network failures as ApiError status 0', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.test',
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
      tokens: tokens(),
    });
    const error = (await client.request('GET', '/x').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(0);
  });
});
