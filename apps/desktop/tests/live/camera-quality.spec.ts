// Live check (client#158): alice calls bob, turns the camera on and we read getStats on both ends:
// alice's outbound video (frameWidth/Height, fps, targetBitrate, bitrate, qualityLimitationReason)
// and bob's inbound (received resolution, fps, bitrate). Default settings must give a crisp 720p.
// Before the fix the uplink estimator decayed to its floor: 320x180-640x360 at ~7 fps and ~35 kbps.
// Not part of CI; run against gitops/local on :18000.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.LIVE_BASE ?? 'http://127.0.0.1:18000';
const PASSWORD = 'Discordy-dev-2026!';

async function launch(email: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [resolve(__dirname, '../..'), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: {
      ...process.env,
      DISCORDY_USER_DATA_DIR: mkdtempSync(join(tmpdir(), 'discordy-live-')),
      DISCORDY_API_URL: BASE,
      DISCORDY_GATEWAY_URL: BASE.replace(/^http/, 'ws'),
      DISCORDY_CDN_URL: `${BASE}/cdn`,
      ELECTRON_RENDERER_URL: '',
    } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.getByLabel('Email').fill(email, { timeout: 30_000 });
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Servers' })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const NativePc = window.RTCPeerConnection;
    const pcs: RTCPeerConnection[] = [];
    (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = pcs;
    window.RTCPeerConnection = class extends NativePc {
      constructor(c?: RTCConfiguration) {
        super(c);
        pcs.push(this);
      }
    };
  });
  return { app, page };
}

interface VideoStat {
  dir: 'out' | 'in';
  w: number;
  h: number;
  fps: number;
  bytes: number;
  target?: number;
  limit?: string;
  codec?: string;
}

async function videoStats(page: Page): Promise<VideoStat[]> {
  return page.evaluate(async () => {
    const out: VideoStat[] = [];
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      const report = await pc.getStats();
      const codecs = new Map<string, string>();
      report.forEach((s) => s.type === 'codec' && codecs.set(s.id, s.mimeType));
      report.forEach((s) => {
        if (s.kind !== 'video') return;
        if (s.type === 'outbound-rtp' && s.frameWidth) out.push({ dir: 'out', w: s.frameWidth, h: s.frameHeight, fps: s.framesPerSecond ?? 0, bytes: s.bytesSent, target: s.targetBitrate, limit: s.qualityLimitationReason, codec: codecs.get(s.codecId) });
        if (s.type === 'inbound-rtp' && s.frameWidth) out.push({ dir: 'in', w: s.frameWidth, h: s.frameHeight, fps: s.framesPerSecond ?? 0, bytes: s.bytesReceived, codec: codecs.get(s.codecId) });
      });
    }
    return out;
  });
}

test('camera defaults give crisp 720p end to end', async () => {
  test.setTimeout(180_000);
  const alice = await launch('alice@discordy.local');
  const bob = await launch('bob@discordy.local');
  try {
    await alice.page.getByRole('navigation', { name: 'Servers' }).getByRole('button').first().click();
    await alice.page.locator('.dm-row', { hasText: 'bob' }).first().click({ timeout: 15_000 });
    await alice.page.getByRole('button', { name: 'Start voice call' }).click();
    await bob.page.getByRole('button', { name: 'Accept' }).click({ timeout: 20_000 });
    await bob.page.waitForTimeout(8_000);
    await alice.page.getByRole('button', { name: /camera|video/i }).first().click();
    await alice.page.waitForTimeout(18_000);
    const a0 = (await videoStats(alice.page)).find((s) => s.dir === 'out');
    const b0 = (await videoStats(bob.page)).find((s) => s.dir === 'in');
    await alice.page.waitForTimeout(10_000);
    const a1 = (await videoStats(alice.page)).find((s) => s.dir === 'out');
    const b1 = (await videoStats(bob.page)).find((s) => s.dir === 'in');
    const kbps = (x?: VideoStat, y?: VideoStat) => (x && y ? Math.round(((y.bytes - x.bytes) * 8) / 10_000) : 0);
    console.log(`[camera] alice out ${JSON.stringify(a1)} sendKbps=${kbps(a0, a1)}`);
    console.log(`[camera] bob in   ${JSON.stringify(b1)} recvKbps=${kbps(b0, b1)}`);
    expect(a1?.w, 'sent width').toBeGreaterThanOrEqual(1280);
    expect(a1?.h, 'sent height').toBeGreaterThanOrEqual(720);
    expect(a1?.limit, 'not bandwidth limited').not.toBe('bandwidth');
    expect(b1?.w, 'received width').toBeGreaterThanOrEqual(1280);
    expect(b1?.h, 'received height').toBeGreaterThanOrEqual(720);
    expect(b1?.fps ?? 0, 'received fps').toBeGreaterThanOrEqual(15);
    expect(kbps(b0, b1), 'received kbps').toBeGreaterThan(400);
  } finally {
    await alice.app.close().catch(() => undefined);
    await bob.app.close().catch(() => undefined);
  }
});
