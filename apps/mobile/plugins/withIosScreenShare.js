const { withXcodeProject } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;

const TARGET = 'VoicsBroadcast';

/** Keep the extension reproducible: prebuild owns both its source files and its embedded Xcode target. */
module.exports = function withIosScreenShare(config) {
  const bundleId = `${config.ios.bundleIdentifier}.broadcast`;
  const group = `group.${config.ios.bundleIdentifier}`;
  config.ios.entitlements = {
    ...config.ios.entitlements,
    'com.apple.security.application-groups': [...new Set([...(config.ios.entitlements?.['com.apple.security.application-groups'] ?? []), group])],
  };
  config.ios.infoPlist = { ...config.ios.infoPlist, RTCAppGroupIdentifier: group, RTCScreenSharingExtension: bundleId };
  const eas = config.extra?.eas ?? {};
  const build = eas.build ?? {};
  const experimental = build.experimental ?? {};
  const ios = experimental.ios ?? {};
  config.extra = { ...config.extra, eas: { ...eas, build: { ...build, experimental: { ...experimental, ios: {
    ...ios,
    appExtensions: [...(ios.appExtensions ?? []).filter((extension) => extension.targetName !== TARGET),
      { targetName: TARGET, bundleIdentifier: bundleId, entitlements: { 'com.apple.security.application-groups': [group] } }],
  } } } } };
  return withXcodeProject(config, (mod) => {
    const root = mod.modRequest.platformProjectRoot;
    const directory = path.join(root, TARGET);
    fs.mkdirSync(directory, { recursive: true });
    for (const file of ['SampleHandler.swift', 'FrameUploader.swift']) fs.copyFileSync(path.join(__dirname, 'broadcast', file), path.join(directory, file));
    fs.copyFileSync(path.join(__dirname, '../modules/voics-screen-share/ios/BroadcastSignals.swift'), path.join(directory, 'BroadcastSignals.swift'));
    fs.writeFileSync(path.join(directory, 'Info.plist'), plist.build({
      CFBundleDisplayName: `${config.name} Screen Share`, CFBundleExecutable: '$(EXECUTABLE_NAME)',
      CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)', CFBundleInfoDictionaryVersion: '6.0',
      CFBundleName: '$(PRODUCT_NAME)', CFBundlePackageType: 'XPC!',
      CFBundleShortVersionString: config.version, CFBundleVersion: config.ios.buildNumber ?? '1',
      RTCAppGroupIdentifier: group,
      NSExtension: { NSExtensionPointIdentifier: 'com.apple.broadcast-services-upload',
        NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).SampleHandler', RPBroadcastProcessMode: 'RPBroadcastProcessModeSampleBuffer' },
    }));
    fs.writeFileSync(path.join(directory, `${TARGET}.entitlements`), plist.build({ 'com.apple.security.application-groups': [group] }));
    const project = mod.modResults;
    if (Object.values(project.pbxNativeTargetSection()).some((target) => typeof target === 'object' && target.name?.replaceAll('"', '') === TARGET)) return mod;
    const target = project.addTarget(TARGET, 'app_extension', TARGET, bundleId);
    const sources = ['SampleHandler.swift', 'FrameUploader.swift', 'BroadcastSignals.swift'].map((file) => `${TARGET}/${file}`);
    project.addBuildPhase(sources, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    const configs = project.pbxXCBuildConfigurationSection();
    const list = project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList];
    for (const entry of list.buildConfigurations) Object.assign(configs[entry.value].buildSettings, {
      INFOPLIST_FILE: `"${TARGET}/Info.plist"`, CODE_SIGN_ENTITLEMENTS: `"${TARGET}/${TARGET}.entitlements"`,
      SWIFT_VERSION: '5.9', IPHONEOS_DEPLOYMENT_TARGET: '15.1', TARGETED_DEVICE_FAMILY: '1',
      APPLICATION_EXTENSION_API_ONLY: 'YES', GENERATE_INFOPLIST_FILE: 'NO',
      CLANG_ENABLE_MODULES: 'YES', CODE_SIGN_STYLE: 'Automatic',
    });
    return mod;
  });
};
