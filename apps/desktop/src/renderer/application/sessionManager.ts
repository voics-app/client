/** Auth lifecycle: boot from the OS-keychain vault, login/register, device registration, logout. */
import type { AuthResponse } from '@shared/contracts/rest';
import type { StoredSession } from '@shared/ipc';
import type { ApiPort } from './ports/api';
import { useGuildStore } from './stores/guildStore';
import { useMessageStore } from './stores/messageStore';
import { usePresenceStore, useReadStateStore, useRelationshipStore } from './stores/peopleStores';
import { useSessionStore } from './stores/sessionStore';
import { useVoiceStore } from './stores/voiceStore';
import { BRAND } from '@shared/brand';

export interface SessionVault {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export interface TokenPair {
  access: string | null;
  refresh: string | null;
}

export interface SessionRuntime {
  api: ApiPort;
  connect(): void;
  disconnect(): void;
  setTokens(tokens: TokenPair): void;
}

export interface SessionDeps {
  vault: SessionVault;
  runtime: SessionRuntime;
  /** Opens the native identity for the user; null when the native module is unavailable. */
  identity(userId: string): Promise<{ identityKeyB64: string } | null>;
  deviceName?: string;
  /** Called after sign-in/out so private-messaging engines can start or stop. */
  onChange?(signedIn: boolean): void;
}

export class SessionManager {
  private stored: StoredSession | null = null;

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

  async register(body: { email: string; username: string; password: string }): Promise<void> {
    this.deps.runtime.setTokens({ access: null, refresh: null });
    const auth = await this.deps.runtime.api.register(body);
    await this.adopt(auth);
  }

  async logout(): Promise<void> {
    try {
      await this.deps.runtime.api.logout();
    } catch {
      // The local sign-out must succeed even when the server is unreachable.
    }
    await this.teardown();
  }

  /** Invoked by the HTTP layer when refresh fails: the session is gone server-side. */
  async sessionExpired(): Promise<void> {
    await this.teardown();
  }

  /** Persists rotated tokens (called by the runtime after a refresh). */
  async persistTokens(tokens: TokenPair): Promise<void> {
    if (!this.stored || !tokens.access || !tokens.refresh) return;
    this.stored = { ...this.stored, accessToken: tokens.access, refreshToken: tokens.refresh };
    await this.deps.vault.save(this.stored);
  }

  private async adopt(auth: AuthResponse): Promise<void> {
    const rt = this.deps.runtime;
    rt.setTokens({ access: auth.access_token, refresh: auth.refresh_token });
    const session = useSessionStore.getState();
    session.setUser(auth.user);
    const identity = await this.deps.identity(auth.user.id).catch(() => null);
    let deviceId: string | null = null;
    if (identity) {
      const device = await rt.api.registerDevice({
        name: this.deps.deviceName ?? `${BRAND.displayName} desktop`,
        identity_key_b64: identity.identityKeyB64,
      });
      deviceId = device.device_id;
    }
    session.setDevice(deviceId, identity?.identityKeyB64 ?? null);
    this.stored = { accessToken: auth.access_token, refreshToken: auth.refresh_token, userId: auth.user.id, deviceId };
    await this.deps.vault.save(this.stored);
    this.begin();
  }

  private begin(): void {
    useSessionStore.getState().setStatus('connecting');
    this.deps.runtime.connect();
    this.deps.onChange?.(true);
  }

  private async teardown(): Promise<void> {
    this.deps.onChange?.(false);
    this.deps.runtime.disconnect();
    this.deps.runtime.setTokens({ access: null, refresh: null });
    await this.deps.vault.clear().catch(() => undefined);
    this.stored = null;
    useGuildStore.getState().reset();
    useMessageStore.getState().reset();
    usePresenceStore.getState().reset();
    useReadStateStore.getState().reset();
    useRelationshipStore.getState().hydrate([]);
    useVoiceStore.getState().resetCall();
    useSessionStore.getState().reset();
  }
}
