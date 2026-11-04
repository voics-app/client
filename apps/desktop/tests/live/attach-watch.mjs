// Attaches to a running dev client started with `electron-vite dev --remoteDebuggingPort 9222`
// and logs console output plus gateway/voice WebSocket frames for WATCH_MS (default 10 min).
//   node tests/live/attach-watch.mjs > watch.log
import { chromium } from '@playwright/test';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('5173') || p.url().startsWith('file:'));
if (!page) throw new Error('no Voics window found on :9222');
const stamp = () => new Date().toISOString().slice(11, 23);
console.log(`${stamp()} attached to ${page.url()}`);

page.on('console', (m) => console.log(`${stamp()} [console.${m.type()}] ${m.text().slice(0, 400)}`));
page.on('pageerror', (e) => console.log(`${stamp()} [pageerror] ${e.message}`));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
cdp.on('Network.webSocketCreated', (e) => console.log(`${stamp()} [ws open] ${e.url}`));
cdp.on('Network.webSocketClosed', () => console.log(`${stamp()} [ws close]`));
cdp.on('Network.webSocketFrameError', (e) => console.log(`${stamp()} [ws error] ${e.errorMessage}`));
const show = (dir, payload) => {
  if (/"op":(1|3|6|11)[,}]/.test(payload) && !payload.includes('"t":')) return; // heartbeats
  console.log(`${stamp()} [ws ${dir}] ${payload.slice(0, 300)}`);
};
cdp.on('Network.webSocketFrameSent', (e) => show('->', e.response.payloadData));
cdp.on('Network.webSocketFrameReceived', (e) => show('<-', e.response.payloadData));

await new Promise((r) => setTimeout(r, Number(process.env.WATCH_MS ?? 600_000)));
console.log(`${stamp()} watch ended`);
process.exit(0);
