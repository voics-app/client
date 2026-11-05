import brand from '../../desktop/brand.json';
import config from '../app.config';

describe('app.config', () => {
  it('takes name, scheme and bundle id from brand.json', () => {
    expect(config.name).toBe(brand.displayName);
    expect(config.scheme).toBe(brand.protocolScheme);
    expect(config.ios?.bundleIdentifier).toBe(brand.appId);
    expect(config.android?.package).toBe(brand.appId);
  });

  it('asks for the microphone and camera, and keeps a call alive in the background', () => {
    const plist = config.ios?.infoPlist ?? {};
    expect(plist.NSMicrophoneUsageDescription).toMatch(/microphone/);
    expect(plist.NSCameraUsageDescription).toMatch(/camera/);
    expect(plist.UIBackgroundModes).toEqual(['audio']);
  });

  it('adds the development client and the WebRTC plugin', () => {
    const names = (config.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toEqual(expect.arrayContaining(['expo-dev-client', '@config-plugins/react-native-webrtc']));
  });
});

describe('app.config tablets', () => {
  it('runs natively on iPad, full screen because the app is portrait only', () => {
    expect(config.ios?.supportsTablet).toBe(true);
    expect(config.ios?.requireFullScreen).toBe(true);
    expect(config.orientation).toBe('portrait');
  });
});
