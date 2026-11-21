const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withQaCleartext(config) {
  if (!config.android?.package?.endsWith('.qa')) throw new Error('Cleartext is restricted to the separate QA application');
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application is missing');
    application.$['android:usesCleartextTraffic'] = 'true';
    return result;
  });
};
