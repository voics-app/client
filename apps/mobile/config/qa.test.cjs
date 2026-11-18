const { test } = require('node:test');
const assert = require('node:assert/strict');
const { qaConfig } = require('./qa.cjs');
const brand = { appId: 'nl.voics.app', displayName: 'Voics', protocolScheme: 'voics' };

test('release defaults ignore endpoint variables without the QA opt-in', () => {
  assert.equal(qaConfig({ VOICS_QA_API_URL: 'http://localhost' }, brand), null);
});
test('a QA app has a separate identity and emulator endpoints', () => {
  const config = qaConfig({ VOICS_MOBILE_QA: '1' }, brand);
  assert.equal(config.appId, 'nl.voics.app.qa');
  assert.equal(config.apiUrl, 'http://10.0.2.2:28100');
});
test('store, preview and published APK builds reject QA opt-in', () => {
  for (const profile of ['production', 'preview', 'apk']) {
    assert.throws(() => qaConfig({ VOICS_MOBILE_QA: '1', EAS_BUILD_PROFILE: profile }, brand), /restricted/);
  }
});
test('QA endpoints reject credentials and non-network protocols', () => {
  assert.throws(() => qaConfig({ VOICS_MOBILE_QA: '1', VOICS_QA_API_URL: 'file:///tmp' }, brand), /Invalid/);
  assert.throws(() => qaConfig({ VOICS_MOBILE_QA: '1', VOICS_QA_GATEWAY_URL: 'ws://user:pass@localhost' }, brand), /Invalid/);
});
