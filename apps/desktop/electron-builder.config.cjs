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
  mac: { category: 'public.app-category.social-networking', target: ['dmg'], icon: 'build/icon.png' },
  // No "-Setup" in the Linux names: an AppImage is not an installer. latest-linux.yml (AppImage auto-update) names this file.
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }],
    category: 'Network',
    icon: 'build/icon.png',
    maintainer: brand.publisher,
    artifactName: `${brand.productName}-\${version}.\${ext}`,
    mimeTypes: [`x-scheme-handler/${brand.protocolScheme}`],
  },
};
