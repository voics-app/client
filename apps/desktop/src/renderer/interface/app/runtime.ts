/** Composition root: builds the HTTP/gateway clients, session manager and dispatch routing once per app start. */
import { QueryClient } from '@tanstack/react-query';
import { ALL_INTENTS, type VoiceServerUpdate } from '@shared/contracts/gateway';
import type { AppInfo } from '@shared/ipc';
import { createDispatchRouter } from '@renderer/application/dispatchRouter';
import { InteractionService } from '@renderer/application/interactionService';
import { SessionManager, type SessionRuntime, type TokenPair } from '@renderer/application/sessionManager';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { PrivateMessaging } from '@renderer/application/privacy/privateMessaging';
import { TurnCredentials } from '@renderer/application/privacy/turnCredentials';
import { fetchBytes } from '@renderer/infrastructure/http/fetchBytes';
import { browserPeerConnection } from '@renderer/infrastructure/privacy/browserPeerConnection';
import { GatewayClient } from '@renderer/infrastructure/gateway/gatewayClient';
import { DiscordyApi } from '@renderer/infrastructure/http/discordyApi';
import { HttpClient } from '@renderer/infrastructure/http/httpClient';
import { browserSocketFactory } from '@renderer/infrastructure/net/socket';
import type { AuthResponse, ReadyPayload } from '@shared/contracts/rest';
import { bridge, sessionVault } from './bridge';
import { useConnectionStore } from './connectionStore';
import { notifyIncoming } from './notifications';

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
}

export interface RuntimeHooks {
  onVoiceServerUpdate: (update: VoiceServerUpdate) => void;
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
    presence: () => {
      const status = useSessionStore.getState().settings.status;
      return { status: status && status !== 'offline' ? status : 'online', activities: [], afk: false };
    },
  });

  const dispatch = createDispatchRouter({
    onVoiceServerUpdate: (update) => hooks.onVoiceServerUpdate(update),
    onIncomingMessage: notifyIncoming,
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
    deviceLabel: `Discordy ${info.platform}`,
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
    deviceName: `Discordy ${info.platform}`,
    identity: async (userId) => {
      if (!bridge) return null;
      const status = await bridge.crypto.status();
      if (!status.available) return null;
      identityUserId = userId;
      return { identityKeyB64: await privacy.initialiseIdentity() };
    },
    onChange: (signedIn) => {
      queryClient.clear();
      if (!signedIn) {
        privacy.stop();
        turn.clear();
      }
      for (const fn of signedIn ? hooks.onSignedIn : hooks.onSignedOut) fn();
    },
  });

  current = { info, http, api, gateway, session: manager, privacy, interactions: new InteractionService(api), queryClient, hooks };
  return current;
}
