const QA_PROFILES = new Set(['development', 'qa']);

/** Local QA has a separate application identity and can never override a release build. */
function qaConfig(env, brand) {
  if (env.VOICS_MOBILE_QA !== '1') return null;
  if (env.EAS_BUILD_PROFILE && !QA_PROFILES.has(env.EAS_BUILD_PROFILE)) {
    throw new Error('VOICS_MOBILE_QA is restricted to local, development and qa builds');
  }
  const apiUrl = env.VOICS_QA_API_URL || 'http://10.0.2.2:28100/api/v1';
  const gatewayUrl = env.VOICS_QA_GATEWAY_URL || 'ws://10.0.2.2:28100/gateway';
  const cdnUrl = env.VOICS_QA_CDN_URL || 'http://10.0.2.2:28100/cdn';
  for (const [name, value, protocols] of [
    ['API', apiUrl, ['http:', 'https:']],
    ['gateway', gatewayUrl, ['ws:', 'wss:']],
    ['CDN', cdnUrl, ['http:', 'https:']],
  ]) {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error(`Invalid QA ${name} URL`);
    }
  }
  return { apiUrl, gatewayUrl, cdnUrl, appId: `${brand.appId}.qa`, name: `${brand.displayName} QA`, scheme: `${brand.protocolScheme}-qa` };
}

module.exports = { qaConfig };
