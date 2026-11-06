import brand from '../../desktop/brand.json';
import config from '../app.config';

describe('app.config', () => {
  it('takes name, scheme and bundle id from brand.json', () => {
    expect(config.name).toBe(brand.displayName);
    expect(config.scheme).toBe(brand.protocolScheme);
    expect(config.ios?.bundleIdentifier).toBe(brand.appId);
    expect(config.android?.package).toBe(brand.appId);
  });

  it('asks for the microphone and camera, and keeps a call alive in the background and lets a VoIP push wake the app', () => {
    const plist = config.ios?.infoPlist ?? {};
    expect(plist.NSMicrophoneUsageDescription).toMatch(/microphone/);
    expect(plist.NSCameraUsageDescription).toMatch(/camera/);
    // voip is what lets a PushKit push wake the app for an incoming call (modules/voics-callkit).
    expect(plist.UIBackgroundModes).toEqual(['audio', 'voip']);
  });

  it('adds the push notification entitlement and tells the app which APNs host its tokens belong to', () => {
    const names = (config.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toContain('expo-notifications');
    expect(['sandbox', 'production']).toContain(config.extra?.pushEnvironment);
  });

  it('adds the development client and the WebRTC plugin', () => {
    const names = (config.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toEqual(expect.arrayContaining(['expo-dev-client', '@config-plugins/react-native-webrtc']));
  });
});

describe('app.config tablets', () => {
  it('stays iPhone only for the first release, in portrait', () => {
    expect(config.ios?.supportsTablet).toBe(false);
    expect(config.orientation).toBe('portrait');
  });
});
