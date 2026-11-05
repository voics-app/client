import { createNativePush, type NotificationsModule } from '../../../src/notifications/push/nativePush';

type Handler = { handleNotification(n: { request: { content: { data: unknown } } }): Promise<object> };

function fakeModule(overrides: Partial<NotificationsModule> = {}) {
  const calls: { handler: Handler | null } = { handler: null };
  const module: NotificationsModule = {
    getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
    requestPermissionsAsync: jest.fn(async (_request?: object) => ({ status: 'granted' })),
    getDevicePushTokenAsync: jest.fn(async () => ({ type: 'ios', data: 'abcdef' as unknown })),
    addPushTokenListener: jest.fn((_listener: (token: { data: unknown }) => void) => ({ remove: jest.fn() })),
    addNotificationResponseReceivedListener: jest.fn((_listener: (response: { notification: { request: { content: { data: unknown } } } }) => void) => ({ remove: jest.fn() })),
    getLastNotificationResponse: jest.fn(() => null),
    setNotificationHandler: jest.fn((handler: Handler | null) => void (calls.handler = handler)),
    setBadgeCountAsync: jest.fn(async (_count: number) => true),
    ...overrides,
  };
  return { module, calls };
}

describe('createNativePush', () => {
  it('maps the permission states and asks for alert, badge and sound', async () => {
    const { module } = fakeModule();
    const push = createNativePush(module);
    expect(await push.permission()).toBe('undetermined');
    expect(await push.request()).toBe('granted');
    expect(module.requestPermissionsAsync).toHaveBeenCalledWith({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    (module.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await push.permission()).toBe('denied');
  });

  it('returns the APNs token text, or null when the system gives none', async () => {
    const { module } = fakeModule();
    expect(await createNativePush(module).deviceToken()).toBe('abcdef');
    (module.getDevicePushTokenAsync as jest.Mock).mockRejectedValue(new Error('no entitlement'));
    expect(await createNativePush(module).deviceToken()).toBeNull();
    (module.getDevicePushTokenAsync as jest.Mock).mockResolvedValue({ type: 'ios', data: 42 });
    expect(await createNativePush(module).deviceToken()).toBeNull();
  });

  it('passes the custom payload keys of a tap, and of the notification that launched the app', async () => {
    const response = { notification: { request: { content: { data: { channel_id: '10' } } } } };
    const { module } = fakeModule({ getLastNotificationResponse: jest.fn(() => response) });
    const push = createNativePush(module);
    const seen: unknown[] = [];
    push.onTap((data) => seen.push(data));
    (module.addNotificationResponseReceivedListener as jest.Mock).mock.calls[0][0](response);
    expect(seen).toEqual([{ channel_id: '10' }]);
    expect(await push.launchedBy()).toEqual({ channel_id: '10' });
  });

  it('forwards token changes, ignoring empty ones', () => {
    const { module } = fakeModule();
    const seen: string[] = [];
    createNativePush(module).onTokenChange((token) => seen.push(token));
    const listener = (module.addPushTokenListener as jest.Mock).mock.calls[0][0];
    listener({ data: 'new' });
    listener({ data: '' });
    expect(seen).toEqual(['new']);
  });

  it('shows a foreground push only when the policy says so, never with sound or a badge', async () => {
    const { module, calls } = fakeModule();
    createNativePush(module).setForegroundPolicy((data) => (data as { show: boolean }).show);
    const behave = (show: boolean) => calls.handler!.handleNotification({ request: { content: { data: { show } } } });
    expect(await behave(true)).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false });
    expect(await behave(false)).toMatchObject({ shouldShowBanner: false, shouldShowList: false });
  });

  it('sets the badge and opens the system settings', async () => {
    const { module } = fakeModule();
    const openSettings = jest.fn(async () => undefined);
    const push = createNativePush(module, openSettings);
    await push.setBadge(5);
    await push.openSystemSettings();
    expect(module.setBadgeCountAsync).toHaveBeenCalledWith(5);
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('loadNativePush', () => {
  const load = (native: boolean, os: string) => {
    jest.resetModules();
    jest.doMock('../../../src/native/isNativeBuild', () => ({ isNativeBuild: native }));
    jest.doMock('react-native', () => ({ Platform: { OS: os }, Linking: { openSettings: jest.fn() } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module: { loadNativePush(): unknown } = require('../../../src/notifications/push/nativePush');
    return module.loadNativePush();
  };

  it('is off in Expo Go, whatever the platform', () => {
    expect(load(false, 'ios')).toBeNull();
  });

  it('is off on Android until FCM exists', () => {
    expect(load(true, 'android')).toBeNull();
  });

  it('is on in an iOS development or store build', () => {
    expect(load(true, 'ios')).not.toBeNull();
  });
});
