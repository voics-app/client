/** Normalises the `endpoint` of VOICE_SERVER_UPDATE (a node ws_url, with or without scheme/path) to `wss://host/voice`. */
export function voiceUrl(endpoint: string): string {
  let url = endpoint.trim().replace(/\/+$/, '');
  if (!/^wss?:\/\//.test(url)) url = `wss://${url}`;
  if (!/\/voice$/.test(url)) url = `${url}/voice`;
  return url;
}
