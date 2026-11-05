/** Composition root: builds the HTTP/gateway clients, session manager and dispatch routing once per app start. */
import { QueryClient } from '@tanstack/react-query';
import { ALL_INTENTS, type VoiceServerUpdate } from '@discordy/core/contracts/gateway';
import type { AppInfo } from '@shared/ipc';
import { PrefsSync } from '@discordy/core/application/syncedPrefs';
import { createDispatchRouter } from '@discordy/core/application/dispatchRouter';
import { InteractionService } from '@discordy/core/application/interactionService';
import { SessionManager, type SessionRuntime, type TokenPair } from '@discordy/core/application/sessionManager';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { PrivateMessaging } from '@discordy/core/application/privacy/privateMessaging';
import { TurnCredentials } from '@discordy/core/application/turnCredentials';
import type { IceServer } from '@discordy/core/domain/turn';
import { fetchBytes } from '@renderer/infrastructure/http/fetchBytes';
import { browserPeerConnection } from '@renderer/infrastructure/privacy/browserPeerConnection';
import { GatewayClient } from '@discordy/core/infrastructure/gateway/gatewayClient';
import { DiscordyApi } from '@discordy/core/infrastructure/http/discordyApi';
import { HttpClient } from '@discordy/core/infrastructure/http/httpClient';
import { browserSocketFactory } from '@renderer/infrastructure/net/socket';
import { uploadWithProgress } from '@renderer/infrastructure/http/browserUpload';
import type { AuthResponse, ReadyPayload, VoiceState } from '@discordy/core/contracts/rest';
import { currentPresence } from '@discordy/core/application/selfPresence';
import { bridge, sessionVault } from './bridge';
import { useConnectionStore } from './connectionStore';
import { registerIncoming } from '@discordy/core/application/dispatchRouter';
import { ensureDm } from './dmActions';
import { notifyIncoming, playFriendRequestSound } from './notifications';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { DEVICE_UNREGISTERED_REASON } from '@discordy/core/domain/deliveryMode';
import { BRAND } from '@shared/brand';

export interface Runtime {
  info: AppInfo;
  http: HttpClient;
  api: DiscordyApi;
  gateway: GatewayClient;
  session: SessionManager;
  privacy: PrivateMessaging;
  interactions: InteractionService;
  queryClient: QueryClient;
  /** Extension point filled by feature modules (voice, private messaging). */
  hooks: RuntimeHooks;
  /** Gateway-issued TURN/STUN servers (empty until READY); used by voice and P2P peer connections. */
  iceServers: () => IceServer[];
}

export interface RuntimeHooks {
  onVoiceServerUpdate: (update: VoiceServerUpdate) => void;
  onVoiceState?: (state: VoiceState) => void;
  onSignedIn: Array<() => void>;
  onSignedOut: Array<() => void>;
}

let current: Runtime | null = null;

export function getRuntime(): Runtime {
  if (!current) throw new Error('runtime not initialised');
  return current;
}

export function createRuntime(info: AppInfo): Runtime {
  const { connection } = info;
  useConnectionStore.getState().set({ apiUrl: connection.apiUrl, gatewayUrl: connection.gatewayUrl, cdnUrl: connection.cdnUrl });
  useSessionStore.getState().setAppInfo(info);

  const tokens: TokenPair = { access: null, refresh: null };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });
  const hooks: RuntimeHooks = { onVoiceServerUpdate: () => undefined, onSignedIn: [], onSignedOut: [] };
  let manager: SessionManager | null = null;

  const http: HttpClient = new HttpClient({
    baseUrl: connection.apiUrl,
    progressUpload: uploadWithProgress,
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
    url: connection.gatewayUrl,
    getToken: () => tokens.access,
    getDeviceId: () => useSessionStore.getState().deviceId,
    properties: { os: info.platform, client: 'discordy-desktop', version: info.version },
    socketFactory: browserSocketFactory,
    intents: ALL_INTENTS,
    presence: () => currentPresence(),
  });

  const prefsSync = new PrefsSync({
    updateSettings: (patch) => api.updateSettings(patch),
    onError: (error) => useUiStore.getState().toast({ tone: 'danger', title: 'Could not save your settings', body: error instanceof Error ? error.message : 'Try again.' }),
  });
  prefsSync.start();
  const dispatch = createDispatchRouter({
    onUserSettings: (settings, ready, userId) => prefsSync.onSettings(settings, ready, userId),
    onVoiceServerUpdate: (update) => hooks.onVoiceServerUpdate(update),
    onVoiceState: (state) => hooks.onVoiceState?.(state),
    onIncomingMessage: notifyIncoming,
    onFriendship: (userId) => void ensureDm(userId),
    onFriendRequest: playFriendRequestSound,
    invalidate: (key) => void queryClient.invalidateQueries({ queryKey: [...key] }),
  });
  let identityUserId = '';
  const turn = new TurnCredentials(() => gateway.renewSession());
  const privacy = new PrivateMessaging({
    gateway,
    api,
    crypto: bridge?.crypto,
    getSelf: () => {
      const s = useSessionStore.getState();
      return { userId: s.user?.id ?? identityUserId, deviceId: s.deviceId ?? '', identityKeyB64: s.identityKeyB64 ?? '' };
    },
    createPeerConnection: browserPeerConnection,
    fetchBytes,
    cdnUrl: () => useConnectionStore.getState().cdnUrl,
    iceServers: () => turn.iceServers(),
    deviceLabel: `${BRAND.displayName} ${info.platform}`,
    onIncoming: (message) => registerIncoming(message, notifyIncoming),
  });
  gateway.onDispatch((event, data) => {
    dispatch(event, data);
    if (event === 'READY') turn.update((data as ReadyPayload).turn);
    privacy.handleDispatch(event, data);
    if (event === 'READY' && useSessionStore.getState().deviceId) void privacy.start().catch(() => undefined);
  });
  gateway.onOp((op, data) => privacy.handleGatewayOp(op, data));
  gateway.onState((state) => useSessionStore.getState().setGateway(state));
  gateway.onFatal(() => void manager?.sessionExpired());

  const sessionRuntime: SessionRuntime = {
    api,
    connect: () => gateway.connect(),
    disconnect: () => gateway.disconnect(),
    setTokens: (pair) => {
      tokens.access = pair.access;
      tokens.refresh = pair.refresh;
    },
  };

  manager = new SessionManager({
    vault: sessionVault,
    runtime: sessionRuntime,
    deviceName: `${BRAND.displayName} ${info.platform}`,
    identity: async (userId) => {
      if (!bridge) return null;
      const status = await bridge.crypto.status();
      if (!status.available) return null;
      identityUserId = userId;
      return { identityKeyB64: await privacy.initialiseIdentity() };
    },
    onDeviceRegistrationFailed: () => {
      useUiStore.getState().toast({ tone: 'warning', title: 'Signed in without encrypted modes', body: DEVICE_UNREGISTERED_REASON });
    },
    onChange: (signedIn) => {
      queryClient.clear();
      if (!signedIn) {
        prefsSync.stop();
        prefsSync.start();
        privacy.stop();
        turn.clear();
      }
      for (const fn of signedIn ? hooks.onSignedIn : hooks.onSignedOut) fn();
    },
  });

  current = { info, http, api, gateway, session: manager, privacy, interactions: new InteractionService(api), queryClient, hooks, iceServers: () => turn.iceServers() };
  return current;
}
