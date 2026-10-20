// Live check (client#106): voice is audible on a first call and when the same devices rejoin
// (their crypto stores keep the previous call's MLS group). Run against gitops/local on :18000.
import { expect, test, type Page } from '@playwright/test';
import { close, launch, newDataDir, type Instance } from './matrix-helpers';

// LIVE_REAL_MEDIA=1 runs on the machine's real audio devices (how the owner hit the bug).
const FAKE_MEDIA = process.env.LIVE_REAL_MEDIA ? [] : ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

interface Probe {
  __peak: number;
  __taps: number;
  __srcPeaks: number[];
  __remotePeak: number;
  __pcs: RTCPeerConnection[];
  __gains: GainNode[];
  __srcs: MediaStreamAudioSourceNode[];
}

/** Taps everything routed to the speakers (peak level after all gains) and records peer connections / nodes. */
async function probe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Probe;
    w.__peak = 0;
    w.__taps = 0;
    w.__srcPeaks = [];
    w.__remotePeak = 0;
    w.__pcs = [];
    w.__gains = [];
    w.__srcs = [];
    const Native = window.RTCPeerConnection;
    window.RTCPeerConnection = function (this: unknown, ...a: ConstructorParameters<typeof RTCPeerConnection>) {
      const pc = new Native(...a);
      w.__pcs.push(pc);
      return pc;
    } as unknown as typeof RTCPeerConnection;
    window.RTCPeerConnection.prototype = Native.prototype;
    const mkGain = BaseAudioContext.prototype.createGain;
    BaseAudioContext.prototype.createGain = function (this: BaseAudioContext) {
      const n = mkGain.call(this);
      w.__gains.push(n);
      return n;
    };
    // Remote voices enter the mixer through MediaStreamAudioSourceNodes: measure them before any gain.
    const mkSrc = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function (this: AudioContext, stream: MediaStream) {
      const n = mkSrc.call(this, stream);
      w.__srcs.push(n);
      // getUserMedia tracks carry a device label; WebRTC receiver tracks are labelled with a bare uuid.
      if (!/^[0-9a-f-]{36}$/.test(stream.getAudioTracks()[0]?.label ?? '')) return n;
      const tap = this.createAnalyser();
      n.connect(tap);
      const data = new Float32Array(tap.fftSize);
      const index = w.__srcs.length - 1;
      w.__srcPeaks[index] = 0;
      setInterval(() => {
        tap.getFloatTimeDomainData(data);
        for (const v of data) {
          w.__remotePeak = Math.max(w.__remotePeak, Math.abs(v));
          w.__srcPeaks[index] = Math.max(w.__srcPeaks[index] ?? 0, Math.abs(v));
        }
      }, 50);
      return n;
    };
    const original = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      if (args[0] instanceof AudioDestinationNode) {
        w.__taps += 1;
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        original.call(this, analyser);
        const data = new Float32Array(analyser.fftSize);
        setInterval(() => {
          analyser.getFloatTimeDomainData(data);
          for (const v of data) w.__peak = Math.max(w.__peak, Math.abs(v));
        }, 50);
      }
      return original.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
}

async function diagnostics(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const w = window as unknown as Probe;
    const out: string[] = [];
    for (const pc of w.__pcs) {
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio') out.push(`in ssrc=${r.ssrc} pk=${r.packetsReceived} lost=${r.packetsLost} samples=${r.totalSamplesReceived} concealed=${r.concealedSamples} emitted=${r.jitterBufferEmittedCount} level=${r.audioLevel} track=${r.trackIdentifier} dec=${r.totalSamplesDuration}`);
        if (r.type === 'outbound-rtp' && r.kind === 'audio') out.push(`out pk=${r.packetsSent}`);
      });
      out.push(`pc=${pc.connectionState}`);
    }
    out.push(`gains=${w.__gains.map((g) => g.gain.value).join(',')} ctx=${[...new Set(w.__gains.map((g) => g.context.state))].join(',')}`);
    out.push(`ctxs=${[...new Set(w.__gains.map((g) => g.context))].map((c) => `${c.state}/sink=${JSON.stringify((c as AudioContext & { sinkId?: unknown }).sinkId)}`).join(',')} taps=${w.__taps}`);
    out.push(`srcPeaks=${w.__srcPeaks.map((v) => v.toFixed(3)).join(',')}`);
    out.push(`labels=${w.__srcs.map((n) => JSON.stringify(n.mediaStream.getAudioTracks()[0]?.label)).join(',')}`);
    out.push(`srcs=${w.__srcs.map((n) => n.mediaStream.getAudioTracks().map((t) => `${t.readyState}/${t.muted}`).join('+')).join(';')}`);
    return out.join(' | ');
  });
}

/** Peak of the remote voices entering the mixer, and of everything reaching the speakers. */
/** Samples the WebRTC audio decoder produced for the remote voice (0 = playout never started). */
const decoded = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    let total = 0;
    for (const pc of (window as unknown as Probe).__pcs) {
      (await pc.getStats()).forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio') total += r.totalSamplesReceived ?? 0;
      });
    }
    return total;
  });

const peak = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as Probe).__remotePeak);
const outPeak = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as Probe).__peak);

async function joinLounge(i: Instance): Promise<void> {
  i.page.on('websocket', (ws) => {
    if (ws.url().includes('/gateway')) return;
    const note = (dir: string) => (f: { payload: string | Buffer }) => {
      try {
        const frame = JSON.parse(String(f.payload)) as { op: number; d?: Record<string, unknown> };
        if (![3, 5, 6].includes(frame.op)) i.log.push(`[${i.name} voice${dir}] op${frame.op} ${Object.keys(frame.d ?? {}).join(',')}`);
      } catch {
        /* binary */
      }
    };
    ws.on('framesent', note('>'));
    ws.on('framereceived', note('<'));
  });
  await probe(i.page);
  await i.page.getByRole('navigation', { name: 'Servers' }).getByRole('button', { name: 'Discordy HQ' }).click();
  await i.page.getByRole('button', { name: /Lounge/ }).first().click();
}

async function round(label: string, dirs: { alice: string; bob: string }, resume: boolean) {
  const alice = await launch(`${label}-alice`, { user: 'alice', dataDir: dirs.alice, resume, chromiumArgs: FAKE_MEDIA });
  const bob = await launch(`${label}-bob`, { user: 'bob', dataDir: dirs.bob, resume, chromiumArgs: FAKE_MEDIA });
  await joinLounge(alice);
  await joinLounge(bob);
  await alice.page.waitForTimeout(15_000);
  const result = { alice: await peak(alice.page), bob: await peak(bob.page), aliceSamples: await decoded(alice.page), bobSamples: await decoded(bob.page) };
  console.log(`[rejoin ${label}] decoded samples alice=${result.aliceSamples} bob=${result.bobSamples}`);
  console.log(`[rejoin ${label}] remote peak alice=${result.alice.toFixed(4)} bob=${result.bob.toFixed(4)}; output peak alice=${(await outPeak(alice.page)).toFixed(4)} bob=${(await outPeak(bob.page)).toFixed(4)}`);
  console.log(`  alice: ${await diagnostics(alice.page)}\n  bob: ${await diagnostics(bob.page)}`);
  const noisy = [...alice.log, ...bob.log].filter((l) => /error|DAVE|failed| voice|MIXER/i.test(l) && !/http 404|Failed to load/.test(l));
  if (noisy.length) console.log(noisy.slice(-60).join('\n'));
  await close(alice, bob);
  return result;
}

test('voice is audible on the first call and when the same devices rejoin', async () => {
  test.setTimeout(240_000);
  const dirs = { alice: newDataDir(), bob: newDataDir() };
  const first = await round('first', dirs, false);
  const second = await round('second', dirs, true);
  expect(first.alice).toBeGreaterThan(0.001);
  expect(first.bob).toBeGreaterThan(0.001);
  expect(second.alice).toBeGreaterThan(0.001);
  expect(second.bob).toBeGreaterThan(0.001);
  for (const r of [first, second]) {
    expect(r.aliceSamples).toBeGreaterThan(0);
    expect(r.bobSamples).toBeGreaterThan(0);
  }
});
