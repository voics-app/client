/** Auth lifecycle: boot from the OS-keychain vault, login/register, device registration, logout. */
import type { AuthResponse, PasskeyFinish } from '@discordy/core/contracts/rest';
import type { StoredSession } from './ports/sessionVault';
import type { ApiPort } from '@discordy/core/application/ports/api';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useNotificationSettingsStore, useUserNotesStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { usePresenceStore, useReadStateStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from './stores/voiceStore';
import { brand } from '@discordy/core/domain/brandConfig';
import { GatewayCloseCode } from '@discordy/core/contracts/gateway';

export interface SessionVault {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export interface TokenPair {
  access: string | null;
  refresh: string | null;
}

/** A token this new being rejected means the session itself was revoked, not that the token aged out. */
const FRESH_TOKEN_MS = 30_000;
const RENEW_RETRY_MS = 5_000;

export interface SessionRuntime {
  api: ApiPort;
  connect(): void;
  disconnect(): void;
  setTokens(tokens: TokenPair): void;
  /** Rotates the tokens. Only 'expired' means the session is gone. */
  renewSession(): Promise<'renewed' | 'expired' | 'unavailable'>;
}

export interface SessionDeps {
  vault: SessionVault;
  runtime: SessionRuntime;
  /** Opens the native identity for the user; null when the native module is unavailable. */
  identity(userId: string): Promise<{ identityKeyB64: string } | null>;
  deviceName?: string;
  /** Runs before the server logout, while the tokens still work: the app removes its push token here. A failure is ignored. */
  beforeLogout?(): Promise<void>;
  /** Called after sign-in/out so private-messaging engines can start or stop. */
  onChange?(signedIn: boolean): void;
  /** Sign-in still succeeds; the user is told encrypted modes are off on this device. */
  onDeviceRegistrationFailed?(error: unknown): void;
}

export class SessionManager {
  private stored: StoredSession | null = null;
  private vaultWrites: Promise<void> = Promise.resolve();
  private refreshing: Promise<string | null> | null = null;

  private renewedAt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: SessionDeps) {}

  async boot(): Promise<void> {
    const stored = await this.deps.vault.load().catch(() => null);
    if (!stored) {
      useSessionStore.getState().setStatus('signedOut');
      return;
    }
    this.stored = stored;
    this.deps.runtime.setTokens({ access: stored.accessToken, refresh: stored.refreshToken });
    const identity = await this.deps.identity(stored.userId).catch(() => null);
    useSessionStore.getState().setDevice(stored.deviceId, identity?.identityKeyB64 ?? null);
    this.begin();
  }

  async login(body: { email: string; password: string; totp?: string }): Promise<void> {
    this.deps.runtime.setTokens({ access: null, refresh: null });
    const auth = await this.deps.runtime.api.login(body);
    await this.adopt(auth);
  }

  /** Completes a login that answered 60008 with the ticket and a TOTP or backup code. */
  async loginMfa(body: { ticket: string; code: string }): Promise<void> {
    this.deps.runtime.setTokens({ access: null, refresh: null });
    const auth = await this.deps.runtime.api.loginMfa(body);
    await this.adopt(auth);
  }

  /** Adopts only the session returned by server-side WebAuthn verification. */
  async loginPasskey(body: PasskeyFinish & { ticket: string }): Promise<void> {
    this.deps.runtime.setTokens({ access: null, refresh: null });
    await this.adopt(await this.deps.runtime.api.finishPasskeyLogin(body));
  }

  async register(body: { email: string; username: string; password: string }): Promise<void> {
    this.deps.runtime.setTokens({ access: null, refresh: null });
    const auth = await this.deps.runtime.api.register(body);
    await this.adopt(auth);
  }

  async logout(): Promise<void> {
    await this.deps.beforeLogout?.().catch(() => undefined);
    try {
      await this.deps.runtime.api.logout();
    } catch {
      // The local sign-out must succeed even when the server is unreachable.
    }
    await this.teardown();
  }

  /**
   * The gateway closed for good. Access tokens last minutes and the stored one is usually stale after a restart, so a
   * rejected token only means the session is gone if the refresh is refused too. Offline, the login is kept and retried.
   */
  async gatewayClosed(code: number): Promise<void> {
    if (code !== GatewayCloseCode.AUTHENTICATION_FAILED || Date.now() - this.renewedAt < FRESH_TOKEN_MS) {
      await this.sessionExpired();
      return;
    }
    const renewal = await this.deps.runtime.renewSession();
    if (renewal === 'renewed') {
      this.renewedAt = Date.now();
      this.deps.runtime.connect();
    } else if (renewal === 'expired') {
      await this.sessionExpired();
    } else {
      this.retry = setTimeout(() => void this.gatewayClosed(code), RENEW_RETRY_MS);
    }
  }

  /** Invoked by the HTTP layer when refresh fails: the session is gone server-side. */
  async sessionExpired(): Promise<void> {
    await this.teardown();
  }

  /**
   * Save the retry identity before sending. A lost response or failed successor
   * save leaves the old token and the same request id available after restart.
   * In-memory tokens change only after the new pair is durable.
   */
  renewTokens(
    rotate: (body: { refresh_token: string; request_id: string }) => Promise<Pick<AuthResponse, 'access_token' | 'refresh_token'>>,
    newRequestId: () => string,
  ): Promise<string | null> {
    if (!this.refreshing) {
      this.refreshing = this.rotateTokens(rotate, newRequestId).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  private async rotateTokens(
    rotate: (body: { refresh_token: string; request_id: string }) => Promise<Pick<AuthResponse, 'access_token' | 'refresh_token'>>,
    newRequestId: () => string,
  ): Promise<string | null> {
    let current = this.stored;
    if (!current) return null;
    if (!current.refreshRequestId) {
      const pending = { ...current, refreshRequestId: newRequestId() };
      await this.writeVault(() => this.deps.vault.save(pending));
      if (this.stored !== current) return null;
      this.stored = pending;
      current = pending;
    }
    const rotated = await rotate({ refresh_token: current.refreshToken, request_id: current.refreshRequestId! });
    if (this.stored !== current) return null;
    if (typeof rotated.access_token !== 'string' || !rotated.access_token
      || typeof rotated.refresh_token !== 'string' || !rotated.refresh_token) {
      throw new Error('Refresh response is missing credentials');
    }
    const saved: StoredSession = {
      accessToken: rotated.access_token,
      refreshToken: rotated.refresh_token,
      userId: current.userId,
      deviceId: current.deviceId,
    };
    await this.writeVault(async () => {
      if (this.stored === current) await this.deps.vault.save(saved);
    });
    if (this.stored !== current) return null;
    this.stored = saved;
    this.deps.runtime.setTokens({ access: saved.accessToken, refresh: saved.refreshToken });
    return saved.accessToken;
  }

  /** Serializes saves and clears so logout cannot be undone by a delayed save. */
  private writeVault(write: () => Promise<void>): Promise<void> {
    const pending = this.vaultWrites.then(write);
    this.vaultWrites = pending.catch(() => undefined);
    return pending;
  }

  private async adopt(auth: AuthResponse): Promise<void> {
    const rt = this.deps.runtime;
    rt.setTokens({ access: auth.access_token, refresh: auth.refresh_token });
    const session = useSessionStore.getState();
    session.setUser(auth.user);
    const identity = await this.deps.identity(auth.user.id).catch(() => null);
    let deviceId: string | null = null;
    if (identity) {
      try {
        const device = await rt.api.registerDevice({
          name: this.deps.deviceName ?? `${brand().displayName} desktop`,
          identity_key_b64: identity.identityKeyB64,
        });
        deviceId = device.device_id;
      } catch (error) {
        this.deps.onDeviceRegistrationFailed?.(error);
      }
    }
    session.setDevice(deviceId, identity?.identityKeyB64 ?? null);
    this.stored = { accessToken: auth.access_token, refreshToken: auth.refresh_token, userId: auth.user.id, deviceId };
    const stored = this.stored;
    await this.writeVault(() => this.deps.vault.save(stored));
    this.begin();
  }

  private begin(): void {
    useSessionStore.getState().setStatus('connecting');
    this.deps.runtime.connect();
    this.deps.onChange?.(true);
  }

  private async teardown(): Promise<void> {
    this.stored = null;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.renewedAt = 0;
    this.deps.onChange?.(false);
    this.deps.runtime.disconnect();
    this.deps.runtime.setTokens({ access: null, refresh: null });
    await this.writeVault(() => this.deps.vault.clear()).catch(() => undefined);
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    usePresenceStore.getState().reset();
    useReadStateStore.getState().reset();
    useRelationshipStore.getState().hydrate([]);
    useNotificationSettingsStore.getState().reset();
    useUserNotesStore.getState().reset();
    useVoiceStore.getState().resetCall();
    useSessionStore.getState().reset();
  }
}
