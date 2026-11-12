import type { GatewayState } from '@discordy/core/application/ports/gateway';
import type { PushTokenBody } from '@discordy/core/contracts/rest';
import type { NativePush } from '../../../src/notifications/push/nativePush';
import { PushController } from '../../../src/notifications/push/PushController';
import type { PermissionState, PushStatus, PushTarget } from '../../../src/notifications/push/pushModel';

function setup(initial: { permission?: PermissionState; offered?: boolean; native?: boolean; token?: string | null; launchedBy?: unknown; platform?: 'apns' | 'fcm' } = {}) {
  let permission: PermissionState = initial.permission ?? 'undetermined';
  let offered = initial.offered ?? false;
  const listeners = { tap: [] as ((data: unknown) => void)[], token: [] as ((token: string) => void)[] };
  let foreground: ((data: unknown) => boolean) | null = null;
  const native = {
    platform: initial.platform ?? ('apns' as 'apns' | 'fcm'),
    prepare: jest.fn(async () => undefined),
    permission: jest.fn(async () => permission),
    request: jest.fn(async (): Promise<PermissionState> => permission),
    deviceToken: jest.fn(async () => (initial.token === undefined ? 'devtoken' : initial.token)),
    onTokenChange: jest.fn((listener: (token: string) => void) => {
      listeners.token.push(listener);
      return jest.fn();
    }),
    onTap: jest.fn((listener: (data: unknown) => void) => {
      listeners.tap.push(listener);
      return jest.fn();
    }),
    launchedBy: jest.fn(async () => initial.launchedBy ?? null),
    setForegroundPolicy: jest.fn((decide: (data: unknown) => boolean) => void (foreground = decide)),
    setBadge: jest.fn(async (_count: number) => undefined),
    openSystemSettings: jest.fn(async () => undefined),
  };
  const registered: PushTokenBody[] = [];
  const opened: PushTarget[] = [];
  const statuses: PushStatus[] = [];
  let agree = true;
  let gateway: GatewayState = 'ready';
  let viewing: string | null = null;
  const previews = { value: true };
  const onlyMentions = { value: false };
  const registerPushToken = jest.fn(async (body: PushTokenBody) => void registered.push(body));
  const controller = new PushController({
    native: initial.native === false ? null : (native as unknown as NativePush),
    api: { registerPushToken },
    prefs: { offered: () => offered, previews: () => previews.value, onlyMentions: () => onlyMentions.value, markOffered: () => void (offered = true) },
    setStatus: (status) => void statuses.push(status),
    environment: 'sandbox',
    gatewayState: () => gateway,
    viewing: () => viewing,
    open: (target) => void opened.push(target),
    offer: jest.fn(async () => agree),
  });
  return {
    controller,
    native,
    registered,
    opened,
    statuses,
    listeners,
    registerPushToken,
    foreground: (data: unknown) => foreground!(data),
    setPermission: (next: PermissionState) => void (permission = next),
    setAgree: (next: boolean) => void (agree = next),
    setGateway: (next: GatewayState) => void (gateway = next),
    setViewing: (next: string | null) => void (viewing = next),
    previews,
    onlyMentions,
    wasOffered: () => offered,
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('PushController without the native module (Expo Go)', () => {
  it('does nothing and reports push as unavailable', async () => {
    const t = setup({ native: false });
    t.controller.attach();
    await t.controller.signedInStart(true);
    await t.controller.enable();
    await t.controller.refresh();
    t.controller.setBadge(3);
    t.controller.signedOut();
    expect(t.statuses).toEqual(['unavailable']);
    expect(t.registerPushToken).not.toHaveBeenCalled();
  });
});

describe('registration', () => {
  it('registers the device token with the build environment and the device preferences once signed in with permission', async () => {
    const t = setup({ permission: 'granted' });
    t.previews.value = false;
    t.onlyMentions.value = true;
    t.controller.attach();
    await t.controller.signedInStart(false);
    expect(t.registered).toEqual([{ platform: 'apns', token: 'devtoken', environment: 'sandbox', previews: false, only_mentions: true }]);
  });

  it('registers an Android phone with its FCM token as platform fcm, and prepares the channels when it starts listening', async () => {
    const t = setup({ permission: 'granted', platform: 'fcm', token: 'fcm-token' });
    t.controller.attach();
    expect(t.native.prepare).toHaveBeenCalled();
    await t.controller.signedInStart(false);
    expect(t.registered).toEqual([{ platform: 'fcm', token: 'fcm-token', environment: 'production', previews: true, only_mentions: false }]);
  });

  it('does not register before permission, or when the system gives no token', async () => {
    const t = setup({ permission: 'undetermined' });
    await t.controller.signedInStart(false);
    expect(t.registered).toEqual([]);
    const none = setup({ permission: 'granted', token: null });
    await none.controller.signedInStart(false);
    expect(none.registered).toEqual([]);
  });

  it('registers again when the system rotates the token, and not before sign-in', async () => {
    const t = setup({ permission: 'granted' });
    t.controller.attach();
    t.listeners.token[0]!('early');
    await tick();
    expect(t.registered).toEqual([]);
    await t.controller.signedInStart(false);
    t.listeners.token[0]!('rotated');
    await tick();
    expect(t.registered.map((r) => r.token)).toEqual(['devtoken', 'rotated']);
  });

  it('survives an api failure and tries again at the next start', async () => {
    const t = setup({ permission: 'granted' });
    t.registerPushToken.mockRejectedValueOnce(new Error('offline'));
    await t.controller.signedInStart(false);
    await t.controller.signedInStart(false);
    expect(t.registered).toHaveLength(1);
  });

  it('refresh tells the api about a changed preference, only when signed in with permission', async () => {
    const t = setup({ permission: 'granted' });
    await t.controller.refresh();
    expect(t.registered).toEqual([]);
    await t.controller.signedInStart(false);
    t.previews.value = false;
    await t.controller.refresh();
    expect(t.registered.at(-1)).toMatchObject({ previews: false });
  });
});

describe('the permission prompt', () => {
  it('waits at launch, then explains and asks the first time a chat is open', async () => {
    const t = setup({ permission: 'undetermined' });
    await t.controller.signedInStart(false);
    expect(t.native.request).not.toHaveBeenCalled();
    t.native.request.mockImplementation(async () => {
      t.setPermission('granted');
      return 'granted';
    });
    await t.controller.enteredChat();
    expect(t.native.request).toHaveBeenCalledTimes(1);
    expect(t.wasOffered()).toBe(true);
    expect(t.registered).toHaveLength(1);
    await t.controller.enteredChat();
    expect(t.native.request).toHaveBeenCalledTimes(1);
  });

  it('does not show the system prompt when the person says not now, and does not ask again', async () => {
    const t = setup({ permission: 'undetermined' });
    t.setAgree(false);
    await t.controller.signedInStart(true);
    await t.controller.enteredChat();
    expect(t.native.request).not.toHaveBeenCalled();
    expect(t.wasOffered()).toBe(true);
  });

  it('never prompts again after a refusal in iOS', async () => {
    const t = setup({ permission: 'denied', offered: true });
    await t.controller.signedInStart(true);
    expect(t.native.request).not.toHaveBeenCalled();
    expect(t.statuses.at(-1)).toBe('denied');
  });

  it('offers nothing before sign-in', async () => {
    const t = setup({ permission: 'undetermined' });
    await t.controller.enteredChat();
    expect(t.native.request).not.toHaveBeenCalled();
  });

  it('enable asks from settings, and sends a refused person to iOS Settings', async () => {
    const t = setup({ permission: 'undetermined' });
    t.native.request.mockImplementation(async () => {
      t.setPermission('granted');
      return 'granted';
    });
    await t.controller.signedInStart(false);
    await t.controller.enable();
    expect(t.registered).toHaveLength(1);
    const refused = setup({ permission: 'denied' });
    await refused.controller.enable();
    expect(refused.native.openSystemSettings).toHaveBeenCalled();
    expect(refused.native.request).not.toHaveBeenCalled();
  });
});

describe('tapping a notification', () => {
  const data = { channel_id: '10', guild_id: '1', message_id: '100' };

  it('opens the chat and message when signed in', async () => {
    const t = setup({ permission: 'granted' });
    t.controller.attach();
    await t.controller.signedInStart(false);
    t.listeners.tap[0]!(data);
    expect(t.opened).toEqual([{ guildId: '1', channelId: '10', messageId: '100' }]);
  });

  it('keeps a tap that launched the app until the session is ready', async () => {
    const t = setup({ permission: 'granted', launchedBy: data });
    t.controller.attach();
    await tick();
    expect(t.opened).toEqual([]);
    await t.controller.signedInStart(false);
    expect(t.opened).toEqual([{ guildId: '1', channelId: '10', messageId: '100' }]);
  });

  it('keeps a tap that arrives while signed out until the next sign-in, and ignores payloads that name no chat', async () => {
    const t = setup({ permission: 'granted' });
    t.controller.attach();
    await t.controller.signedInStart(false);
    t.controller.signedOut();
    t.listeners.tap[0]!(data);
    t.listeners.tap[0]!({ nothing: true });
    expect(t.opened).toEqual([]);
    await t.controller.signedInStart(false);
    expect(t.opened).toEqual([{ guildId: '1', channelId: '10', messageId: '100' }]);
  });
});

describe('foreground behaviour and the badge', () => {
  it('suppresses a push the in-app banner covers and shows one when the gateway is down', () => {
    const t = setup({ permission: 'granted' });
    t.controller.attach();
    expect(t.foreground({ channel_id: '10' })).toBe(false);
    t.setGateway('closed');
    expect(t.foreground({ channel_id: '10' })).toBe(true);
    t.setViewing('10');
    expect(t.foreground({ channel_id: '10' })).toBe(false);
  });

  it('sets the badge to the unread mentions and clears it at sign-out', async () => {
    const t = setup({ permission: 'granted' });
    await t.controller.signedInStart(false);
    t.controller.setBadge(4);
    expect(t.native.setBadge).toHaveBeenLastCalledWith(4);
    t.controller.signedOut();
    expect(t.native.setBadge).toHaveBeenLastCalledWith(0);
  });

  it('stops listening when detached', () => {
    const t = setup();
    t.controller.attach();
    t.controller.detach();
    expect(t.native.onTap.mock.results[0]!.value).toHaveBeenCalled();
  });
});
