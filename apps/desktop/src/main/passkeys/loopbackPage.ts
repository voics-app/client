import type { PasskeyRequest, PasskeySite } from '../../shared/passkeys';

/** No API credentials, MFA ticket, password, third-party resources, or query parameters. */
export function loopbackPage(site: PasskeySite, request: PasskeyRequest, nonce: string): string {
  const json = JSON.stringify({ site, kind: request.kind, publicKey: request.publicKey, nonce }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Continue with your passkey</title>
<style nonce="${nonce}">:root{color-scheme:dark;font:16px system-ui;background:#11131b;color:#eee}body{max-width:34rem;margin:15vh auto;padding:24px;line-height:1.6}button{font:inherit;padding:12px 18px;margin:8px 8px 0 0;border:1px solid #6b628f;border-radius:8px;background:#30294e;color:inherit;cursor:pointer}button:disabled{opacity:.5}p{color:#c5c1d1}</style>
<h1>Continue with your passkey</h1><p id="description"></p><p id="status" role="status">Keep this tab open while your browser checks your passkey.</p>
<button id="continue">Continue</button><button id="cancel">Cancel</button>
<script nonce="${nonce}">
'use strict';
const setup = ${json};
const status = document.getElementById('status');
const next = document.getElementById('continue');
const cancel = document.getElementById('cancel');
document.getElementById('description').textContent = 'Your browser will open ' + setup.site.origin + '. Your password and session stay in the desktop app.';
let child = null, sent = false, done = false;
async function finish(result) {
  if (done) return;
  done = true; next.disabled = true; cancel.disabled = true;
  if (child && !child.closed) child.postMessage({type:'voics:cancel', nonce:setup.nonce}, setup.site.origin);
  try {
    const response = await fetch('/result', {method:'POST', headers:{'Content-Type':'application/json','X-Voics-Ceremony':setup.nonce}, body:JSON.stringify(result), keepalive:true});
    status.textContent = response.ok ? (result.ok ? 'Passkey checked. Return to the desktop app to finish.' : 'Cancelled. Return to the desktop app to try again or use a backup code.') : 'This request expired. Return to the desktop app and try again.';
  } catch { status.textContent = 'The desktop app closed this request. Return to the app and try again.'; }
}
next.addEventListener('click', () => {
  if (child && !child.closed) { child.focus(); return; }
  child = window.open(setup.site.origin + '/passkeys/index.html', '_blank');
  if (!child) { status.textContent = 'Allow this tab to open a new tab, then select Continue again.'; return; }
  next.disabled = true;
});
window.addEventListener('message', event => {
  if (done || !child || event.source !== child || event.origin !== setup.site.origin) return;
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'voics:ready' && !sent) {
    sent = true;
    child.postMessage({type:'voics:request', nonce:setup.nonce, kind:setup.kind, publicKey:setup.publicKey}, setup.site.origin);
  } else if (message.type === 'voics:result' && message.nonce === setup.nonce && sent) {
    void finish(message.result);
  }
});
cancel.addEventListener('click', () => void finish({ok:false, reason:'cancelled'}));
const monitor = setInterval(() => { if (done) clearInterval(monitor); else if (child && child.closed) void finish({ok:false, reason:'cancelled'}); else if (child && !sent) child.postMessage({type:'voics:hello'}, setup.site.origin); }, 500);
window.addEventListener('pagehide', () => { if (!done) void finish({ok:false, reason:'cancelled'}); });
</script></html>`;
}
