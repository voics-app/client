/**
 * Appends R8 rules to the generated Android project. The release build (EAS `preview` and `production`) fails in `minifyReleaseWithR8` with
 * "Missing class livekit.org.jni_zero.JniZeroJni": the LiveKit WebRTC AAR references a class its JNI layer provides at run time. Its own consumer rules
 * keep the package but do not silence the warning, so `-dontwarn` is the fix R8 itself suggests (missing_rules.txt).
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARK = '# voics: withAndroidProguard';
const RULES = `${MARK}\n-dontwarn livekit.org.jni_zero.**\n`;

module.exports = function withAndroidProguard(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const file = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes(MARK)) fs.writeFileSync(file, `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}${RULES}`);
      return modConfig;
    },
  ]);
};
