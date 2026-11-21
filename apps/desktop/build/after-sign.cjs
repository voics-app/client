// electron-builder afterSign hook. Without a Developer ID (no CSC_LINK) the app is signed ad hoc: Apple
// Silicon refuses to launch a completely unsigned arm64 binary ("is damaged"), an ad-hoc signature is
// enough for the right-click > Open / xattr route. With CSC_LINK set electron-builder has already signed
// (and, with the APPLE_* variables, notarizes) the app, so this does nothing.
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.CSC_LINK) return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`ad-hoc signing ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
