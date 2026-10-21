/** REST transport for `/api/v1`: bearer auth, single-flight refresh, 429 backoff, error envelope. */
import type { ApiErrorBody } from '@shared/contracts/rest';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string,
    readonly errors?: Record<string, unknown>,
    /** Present on a 60008 login answer. */
    readonly ticket?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface TokenSource {
  access(): string | null;
  /** Rotates the refresh token; resolves the new access token or null when the session is gone. */
  refresh(): Promise<string | null>;
  expired(): void;
}

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  tokens: TokenSource;
}

export interface RequestOptions {
  body?: unknown;
  /** Array values are sent as repeated keys. */
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  auth?: boolean;
  headers?: Record<string, string>;
  reason?: string;
}

const MAX_RATE_LIMIT_RETRIES = 3;

export class HttpClient {
  private refreshing: Promise<string | null> | null = null;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
  }

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/+$/, '');
  }

  async request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    return this.execute<T>(method, path, options, 0, false);
  }

  private url(path: string, query?: RequestOptions['query']): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) for (const item of v) params.append(k, item);
      else params.set(k, String(v));
    }
    const qs = params.toString();
    return `${this.baseUrl}/api/v1${path}${qs ? `?${qs}` : ''}`;
  }

  private async execute<T>(method: string, path: string, options: RequestOptions, attempt: number, retriedAuth: boolean): Promise<T> {
    const auth = options.auth ?? true;
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(options.reason);
    const token = auth ? this.options.tokens.access() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await this.fetchFn(this.url(path, options.query), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      throw new ApiError(0, 0, error instanceof Error ? `Network error: ${error.message}` : 'Network error');
    }

    if (response.status === 401 && auth && !retriedAuth) {
      const fresh = await this.refreshOnce();
      if (fresh) return this.execute<T>(method, path, options, attempt, true);
      this.options.tokens.expired();
    }

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const body = (await response.json().catch(() => ({}))) as { retry_after?: number };
      const header = Number(response.headers.get('X-RateLimit-Reset-After') ?? response.headers.get('Retry-After'));
      const seconds = body.retry_after ?? (Number.isFinite(header) ? header : 1);
      await new Promise((r) => setTimeout(r, Math.ceil(seconds * 1000)));
      return this.execute<T>(method, path, options, attempt + 1, retriedAuth);
    }

    if (response.status === 204) return null as T;
    const text = await response.text();
    const parsed: unknown = text ? safeJson(text) : null;
    if (!response.ok) throw errorFromResponse(response.status, text);
    return parsed as T;
  }

  private refreshOnce(): Promise<string | null> {
    if (!this.refreshing) {
      this.refreshing = this.options.tokens
        .refresh()
        .catch(() => null)
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  /** Uploads bytes to a presigned URL (attachments). */
  async upload(url: string, file: Blob, onProgress?: (fraction: number) => void): Promise<void> {
    onProgress?.(0);
    const response = await this.fetchFn(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    if (!response.ok) throw new ApiError(response.status, response.status, `Upload failed (${response.status})`);
    onProgress?.(1);
  }
}

/** Builds the error for a failed response; proxies and gateways send HTML or empty bodies. */
function errorFromResponse(status: number, text: string): ApiError {
  const envelope = parseEnvelope(text);
  const message = envelope?.message || `Request failed with HTTP ${status}`;
  return new ApiError(status, envelope?.code ?? status, message, envelope?.errors, envelope?.ticket);
}

function parseEnvelope(text: string): Partial<ApiErrorBody> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Partial<ApiErrorBody>) : null;
  } catch {
    return null;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
