// electron-builder configuration. Every user-facing name comes from brand.json.
const brand = require('./brand.json');

module.exports = {
  appId: brand.appId,
  productName: brand.productName,
  copyright: brand.displayName,
  artifactName: `${brand.productName}-Setup-\${version}.\${ext}`,
  directories: { app: 'stage', output: 'release', buildResources: 'build' },
  files: ['out/**', 'resources/**', 'package.json'],
  asar: true,
  asarUnpack: ['**/*.node'],
  npmRebuild: false,
  protocols: [{ name: brand.displayName, schemes: [...new Set([brand.protocolScheme, 'discordy'])] }], // brand-check: allow (legacy installed deep links)
  publish: { provider: 'generic', url: brand.updateFeedHost },
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.ico' },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    // Data is kept by default; build/installer.nsh adds a keep or remove choice and a /DELETEDATA flag.
    deleteAppDataOnUninstall: false,
    include: 'build/installer.nsh',
    // NSIS 3.0.4 emits warning 6020 for the uninstaller-only pass; electron-builder would fail the build on it.
    warningsAsErrors: false,
    shortcutName: brand.shortName,
  },
  // macOS: universal (arm64 + x64) .dmg. Unsigned until a Developer ID exists: set CSC_LINK/CSC_KEY_PASSWORD (and
  // APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER for notarization) as secrets and the same config signs.
  // No auto-update on macOS yet: Squirrel.Mac refuses unsigned updates, so no zip/latest-mac.yml is produced.
  mac: {
    category: 'public.app-category.social-networking',
    target: ['dmg'],
    icon: 'build/icon.png',
    artifactName: `${brand.productName}-\${version}.\${ext}`,
    identity: process.env.CSC_LINK ? undefined : null,
    hardenedRuntime: Boolean(process.env.CSC_LINK),
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: Boolean(process.env.APPLE_API_KEY),
    extendInfo: {
      NSMicrophoneUsageDescription: `${brand.displayName} uses the microphone for voice chat.`,
      NSCameraUsageDescription: `${brand.displayName} uses the camera for video calls.`,
    },
  },
  afterSign: 'build/after-sign.cjs',
  linux: { target: ['AppImage', 'deb'], category: 'Network', icon: 'build/icon.png', maintainer: brand.publisher },
};
