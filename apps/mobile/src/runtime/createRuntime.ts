/** Mobile composition root: wires the shared HTTP and gateway clients, the session manager and dispatch routing. */
import { ALL_INTENTS } from '@discordy/core/contracts/gateway';
import type { AuthResponse, ReadyPayload } from '@discordy/core/contracts/rest';
import { createDispatchRouter } from '@discordy/core/application/dispatchRouter';
import { currentPresence } from '@discordy/core/application/selfPresence';
import { SessionManager, type SessionRuntime, type SessionVault, type TokenPair } from '@discordy/core/application/sessionManager';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { TurnCredentials } from '@discordy/core/application/turnCredentials';
import type { IceServer } from '@discordy/core/domain/turn';
import type { SocketFactory } from '@discordy/core/infrastructure/net/socket';
import { GatewayClient } from '@discordy/core/infrastructure/gateway/gatewayClient';
import { DiscordyApi } from '@discordy/core/infrastructure/http/discordyApi';
import { HttpClient } from '@discordy/core/infrastructure/http/httpClient';
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
  /** Builds the voice stack; returns null where native WebRTC is not available (Expo Go). */
  createVoice?: (deps: { gateway: GatewayClient; iceServers: () => IceServer[] }) => MobileVoice | null;
}

export interface MobileRuntime {
  /** The API origin; invite links are built from it. */
  apiUrl: string;
  http: HttpClient;
  api: DiscordyApi;
  gateway: GatewayClient;
  session: SessionManager;
  /** Null in Expo Go, which has no native WebRTC. */
  voice: MobileVoice | null;
}

export function createRuntime(config: RuntimeConfig): MobileRuntime {
  const tokens: TokenPair = { access: null, refresh: null };
  let manager: SessionManager | null = null;

  const http: HttpClient = new HttpClient({
    baseUrl: config.apiUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
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
  const voice = config.createVoice?.({ gateway, iceServers: () => turn.iceServers() }) ?? null;
  // Push notifications and message UI arrive in later milestones; their hooks stay no-ops until then.
  const dispatch = createDispatchRouter({
    onVoiceServerUpdate: (update) => voice?.controller.onVoiceServerUpdate(update),
    onVoiceState: (state) => voice?.controller.onVoiceState(state),
    onIncomingMessage: () => undefined,
    invalidate: () => undefined,
  });
  gateway.onDispatch((event, data) => {
    dispatch(event, data);
    if (event === 'READY') turn.update((data as ReadyPayload).turn);
  });
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
    // Encrypted modes need the native crypto core, which comes to mobile in M3: no identity, no device registration.
    identity: async () => null,
  });

  return { apiUrl: config.apiUrl, http, api, gateway, session: manager, voice };
}
