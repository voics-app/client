/** Mobile composition root: wires the shared HTTP and gateway clients, the session manager and dispatch routing. */
import { ALL_INTENTS } from '@discordy/core/contracts/gateway';
import type { AuthResponse, ReadyPayload } from '@discordy/core/contracts/rest';
import { PrefsSync } from '@discordy/core/application/syncedPrefs';
import { createDispatchRouter, registerIncoming } from '@discordy/core/application/dispatchRouter';
import { PrivateMessaging } from '@discordy/core/application/privacy/privateMessaging';
import { InteractionService } from '@discordy/core/application/interactionService';
import { currentPresence } from '@discordy/core/application/selfPresence';
import { SessionManager, type SessionRuntime, type SessionVault, type TokenPair } from '@discordy/core/application/sessionManager';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { TurnCredentials } from '@discordy/core/application/turnCredentials';
import { errorMessage } from '@discordy/core/application/errorMessage';
import type { CryptoBridge } from '@discordy/core/application/ports/crypto';
import type { IceServer } from '@discordy/core/domain/turn';
import type { SocketFactory } from '@discordy/core/infrastructure/net/socket';
import { GatewayClient } from '@discordy/core/infrastructure/gateway/gatewayClient';
import { DiscordyApi } from '@discordy/core/infrastructure/http/discordyApi';
import { HttpClient, type ProgressUpload } from '@discordy/core/infrastructure/http/httpClient';
import { Alert } from 'react-native';
import { offerBanner } from '../notifications/bannerStore';
import { messageCache } from '../offline/messageCache';
import type { NativePrivacy } from '../privacy/nativePrivacy';
import type { MobileVoice } from '../voice/mobileVoice';

export interface RuntimeConfig {
  apiUrl: string;
  gatewayUrl: string;
  /** Shown in the device list and sent to the gateway, e.g. `Voics iOS`. */
  deviceName: string;
  platform: string;
  version: string;
  vault: SessionVault;
  socketFactory: SocketFactory;
  fetch?: typeof fetch;
  /** Uploads attachments with progress; without it they use a plain PUT and report no progress. */
  progressUpload?: ProgressUpload;
  /** Builds the voice stack; returns null where native WebRTC is not available (Expo Go). */
  createVoice?: (deps: {
    gateway: GatewayClient;
    iceServers: () => IceServer[];
    /** The MLS engine of end-to-end encrypted calls; null where the crypto module does not exist. */
    crypto: CryptoBridge | null;
    identityKeysOf(userId: string): Promise<string[]>;
  }) => MobileVoice | null;
  /** The native crypto and peer connections for Ephemeral and P2P; null where they do not exist (Expo Go). */
  createPrivacy?: () => NativePrivacy | null;
  /** Downloads an encrypted attachment from the CDN; defaults to a plain credential-free fetch. */
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** Public CDN origin, for private attachment links. */
  cdnUrl?: string;
}

export interface MobileRuntime {
  /** The API origin; invite links are built from it. */
  apiUrl: string;
  http: HttpClient;
  api: DiscordyApi;
  gateway: GatewayClient;
  /** Slash commands, message components and modals. */
  interactions: InteractionService;
  session: SessionManager;
  /** Null in Expo Go, which has no native WebRTC. */
  voice: MobileVoice | null;
  /** The Ephemeral and P2P engine; null in Expo Go, where those modes stay unavailable. */
  privacy: PrivateMessaging | null;
}

export function createRuntime(config: RuntimeConfig): MobileRuntime {
  const tokens: TokenPair = { access: null, refresh: null };
  let manager: SessionManager | null = null;

  const http: HttpClient = new HttpClient({
    baseUrl: config.apiUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
    ...(config.progressUpload ? { progressUpload: config.progressUpload } : {}),
    tokens: {
      access: () => tokens.access,
      refresh: async () => {
        if (!tokens.refresh) return null;
        const rotated = await http.request<Pick<AuthResponse, 'access_token' | 'refresh_token'>>('POST', '/auth/refresh', {
          auth: false,
          body: { refresh_token: tokens.refresh },
        });
        tokens.access = rotated.access_token;
        tokens.refresh = rotated.refresh_token;
        await manager?.persistTokens(tokens);
        return tokens.access;
      },
      expired: () => void manager?.sessionExpired(),
    },
  });
  const api = new DiscordyApi(http);

  const gateway = new GatewayClient({
    url: config.gatewayUrl,
    getToken: () => tokens.access,
    getDeviceId: () => useSessionStore.getState().deviceId,
    properties: { os: config.platform, client: 'discordy-mobile', version: config.version },
    socketFactory: config.socketFactory,
    intents: ALL_INTENTS,
    presence: () => currentPresence(),
  });

  const turn = new TurnCredentials(() => gateway.renewSession());
  const nativePrivacy = config.createPrivacy?.() ?? null;
  const voice =
    config.createVoice?.({
      gateway,
      iceServers: () => turn.iceServers(),
      crypto: nativePrivacy?.crypto ?? null,
      identityKeysOf: async (userId) => (await api.listUserDevices(userId)).map((device) => device.identity_key_b64),
    }) ?? null;
  let identityUserId = '';
  const privacy = nativePrivacy
    ? new PrivateMessaging({
        gateway,
        api,
        crypto: nativePrivacy.crypto,
        getSelf: () => {
          const s = useSessionStore.getState();
          return { userId: s.user?.id ?? identityUserId, deviceId: s.deviceId ?? '', identityKeyB64: s.identityKeyB64 ?? '' };
        },
        createPeerConnection: nativePrivacy.createPeerConnection,
        fetchBytes: config.fetchBytes ?? defaultFetchBytes(config.fetch ?? fetch),
        cdnUrl: () => config.cdnUrl ?? '',
        iceServers: () => turn.iceServers(),
        deviceLabel: config.deviceName,
        onIncoming: (message) => registerIncoming(message, offerBanner),
      })
    : null;
  // Push notifications arrive with the native build; until then new messages raise the in-app banner.
  // Theme, accent, text size, reduced motion and the other synced preferences follow the account, as on desktop.
  const prefsSync = new PrefsSync({
    updateSettings: (patch) => api.updateSettings(patch),
    onError: (error) => Alert.alert('Could not save your settings', errorMessage(error)),
  });
  prefsSync.start();
  const dispatch = createDispatchRouter({
    onUserSettings: (settings, ready, userId) => prefsSync.onSettings(settings, ready, userId),
    onVoiceServerUpdate: (update) => voice?.controller.onVoiceServerUpdate(update),
    onVoiceState: (state) => voice?.controller.onVoiceState(state),
    onIncomingMessage: offerBanner,
    invalidate: () => undefined,
  });
  gateway.onDispatch((event, data) => {
    dispatch(event, data);
    if (event === 'READY') turn.update((data as ReadyPayload).turn);
    privacy?.handleDispatch(event, data);
    if (event === 'READY' && privacy && useSessionStore.getState().deviceId) void privacy.start().catch(() => undefined);
  });
  gateway.onOp((op, data) => privacy?.handleGatewayOp(op, data));
  gateway.onState((state) => useSessionStore.getState().setGateway(state));
  gateway.onFatal(() => {
    void voice?.controller.leave();
    void manager?.sessionExpired();
  });

  const sessionRuntime: SessionRuntime = {
    api,
    connect: () => gateway.connect(),
    disconnect: () => {
      turn.clear();
      privacy?.stop();
      void voice?.controller.leave();
      gateway.disconnect();
    },
    setTokens: (pair) => {
      tokens.access = pair.access;
      tokens.refresh = pair.refresh;
    },
  };

  manager = new SessionManager({
    vault: config.vault,
    runtime: sessionRuntime,
    deviceName: config.deviceName,
    onChange: (signedIn) => {
      if (!signedIn) {
        // Nothing of this account stays on the phone: the saved messages go with the session.
        messageCache.clear();
        prefsSync.stop();
        prefsSync.start();
      }
    },
    // Without the native crypto module (Expo Go) there is no identity and no device registration: encrypted modes stay off.
    identity: async (userId) => {
      if (!privacy) return null;
      identityUserId = userId;
      return { identityKeyB64: await privacy.initialiseIdentity() };
    },
  });

  return { apiUrl: config.apiUrl, http, api, gateway, interactions: new InteractionService(api), session: manager, voice, privacy };
}

function defaultFetchBytes(request: typeof fetch): (url: string) => Promise<Uint8Array> {
  return async (url) => {
    const response = await request(url, { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  };
}
