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
  protocols: [{ name: brand.displayName, schemes: [brand.protocolScheme] }],
  publish: { provider: 'generic', url: brand.updateFeedHost },
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.ico', signAndEditExecutable: false },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    shortcutName: brand.shortName,
  },
  mac: { category: 'public.app-category.social-networking', target: ['dmg'], icon: 'build/icon.png' },
  linux: { target: ['AppImage', 'deb'], category: 'Network', icon: 'build/icon.png', maintainer: brand.publisher },
};
