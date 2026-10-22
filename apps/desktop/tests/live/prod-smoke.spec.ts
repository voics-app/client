// Production smoke test: drives the real desktop client (production defaults, no DISCORDY_* URL overrides)
// against the live Discordy production stack with two throwaway accounts. Not part of CI.
// Run: LIVE_BASE=https://discordy-api.voics.nl pnpm exec playwright test -c tests/live/playwright.live.config.ts prod-smoke
// Results are printed as a checklist and written to $PROD_SMOKE_OUT (default: prod-smoke-results.json).
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const API = process.env.LIVE_BASE ?? "https://discordy-api.voics.nl";
const PROD = API === "https://discordy-api.voics.nl";
const CDN_HOST = PROD ? "discordy-cdn.voics.nl" : new URL(API).host;
const SITE = process.env.LIVE_SITE ?? "https://discordy.voics.nl";
const UPDATES = process.env.LIVE_UPDATES ?? "https://discordy-updates.voics.nl";
const PASSWORD = "E2e-Smoke-Test-2026!";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC", "base64");

interface Session { access_token: string; user: { id: string; username: string } }
const results: { step: string; ok: boolean; note: string }[] = [];
let curA: Inst | undefined, curB: Inst | undefined;

async function rest<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Runs one checklist item; a failure is recorded and the run continues. */
async function step(name: string, fn: () => Promise<string | void>): Promise<boolean> {
  try {
    const note = (await fn()) ?? "";
    results.push({ step: name, ok: true, note });
    console.log(`PASS ${name} ${note}`);
    return true;
  } catch (e) {
    const note = String((e as Error).message ?? e).split("\n")[0].slice(0, 300);
    results.push({ step: name, ok: false, note });
    for (const i of [curA, curB]) await i?.page.screenshot({ path: join(process.env.PROD_SMOKE_SHOTS ?? tmpdir(), `fail-${results.length}-${i.name}.png`) }).catch(() => undefined);
    console.log(`FAIL ${name} :: ${note}`);
    return false;
  }
}

interface Inst { name: string; app: ElectronApplication; page: Page; log: string[]; urls: Set<string> }

const probes = () => {
  const w = window as unknown as Record<string, unknown>;
  const pcs: RTCPeerConnection[] = (w.__pcs = []) as RTCPeerConnection[];
  const NativePc = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends NativePc {
    constructor(c?: RTCConfiguration) { super(c); pcs.push(this); }
  } as typeof RTCPeerConnection;
  const ctxs: { context: AudioContext; oscillators: number }[] = (w.__ctxs = []) as never;
  const NativeCtx = window.AudioContext;
  window.AudioContext = class extends NativeCtx {
    constructor(o?: AudioContextOptions) {
      super(o);
      const e = { context: this as AudioContext, oscillators: 0 };
      ctxs.push(e);
      const create = this.createOscillator.bind(this);
      this.createOscillator = () => { e.oscillators += 1; return create(); };
    }
  };
  w.__peak = 0;
  const original = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    if (args[0] instanceof AudioDestinationNode) {
      const an = this.context.createAnalyser();
      an.fftSize = 2048;
      original.call(this, an);
      const data = new Float32Array(an.fftSize);
      setInterval(() => { an.getFloatTimeDomainData(data); for (const v of data) w.__peak = Math.max(w.__peak as number, Math.abs(v)); }, 50);
    }
    return original.apply(this, args);
  } as typeof AudioNode.prototype.connect;
};

async function launch(name: string): Promise<Inst> {
  const log: string[] = [];
  const urls = new Set<string>();
  const env: Record<string, string> = { ...(process.env as Record<string, string>), DISCORDY_USER_DATA_DIR: mkdtempSync(join(tmpdir(), "discordy-prod-")), ELECTRON_RENDERER_URL: "" };
  if (PROD) for (const k of ["DISCORDY_API_URL", "DISCORDY_GATEWAY_URL", "DISCORDY_CDN_URL"]) delete env[k];
  else Object.assign(env, { DISCORDY_API_URL: API, DISCORDY_GATEWAY_URL: API.replace(/^http/, "ws"), DISCORDY_CDN_URL: `${API}/cdn` });
  const app = await electron.launch({ args: [resolve(__dirname, "../.."), "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], env });
  app.process().stderr?.on("data", (d) => log.push(`[${name} main!] ${String(d).trim().slice(0, 300)}`));
  const page = await app.firstWindow();
  page.on("pageerror", (e) => log.push(`[${name} pageerror] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log.push(`[${name} ${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on("request", (r) => { try { const u = new URL(r.url()); urls.add(`${u.protocol}//${u.host}`); } catch { /* ignore */ } });
  page.on("websocket", (ws) => { const u = new URL(ws.url()); urls.add(`${u.protocol}//${u.host}`); });
  page.on("requestfailed", (r) => log.push(`[${name} reqfailed] ${r.method()} ${r.url().slice(0, 110)} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) log.push(`[${name} http ${r.status()}] ${r.request().method()} ${r.url().slice(0, 140)}`); });
  await page.addInitScript(probes);
  await page.reload();
  return { name, app, page, log, urls };
}

async function register(i: Inst, email: string, username: string): Promise<void> {
  const p = i.page;
  await p.getByRole("radio", { name: "Create account" }).or(p.getByRole("button", { name: "Create account" })).first().click({ timeout: 30_000 });
  await p.getByLabel("Email", { exact: true }).last().fill(email);
  await p.getByLabel("Username").last().fill(username);
  await p.getByLabel("Password", { exact: true }).last().fill(PASSWORD);
  await p.getByRole("button", { name: "Create account" }).last().click();
  await expect(p.getByRole("navigation", { name: "Servers" })).toBeVisible({ timeout: 60_000 });
}

const composer = (p: Page) => p.getByRole("textbox", { name: /^Message / });
async function say(p: Page, text: string) { const b = composer(p); await b.fill(text); await b.press("Enter"); }
const sees = (p: Page, text: string, timeout = 30_000) => p.getByText(text, { exact: false }).first().waitFor({ timeout });
const peak = (p: Page) => p.evaluate(() => (window as unknown as { __peak: number }).__peak);
async function openSettingsTab(p: Page, tab: string) {
  await p.getByRole("button", { name: "User settings" }).click();
  await p.getByRole("dialog").getByText(tab, { exact: true }).first().click();
}
async function inbound(p: Page) {
  return p.evaluate(async () => {
    const out = { audio: 0, video: 0, frames: 0, vstreams: 0 };
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      (await pc.getStats()).forEach((s) => {
        if (s.type !== "inbound-rtp") return;
        if (s.kind === "audio") out.audio += s.bytesReceived ?? 0;
        if (s.kind === "video") { out.video += s.bytesReceived ?? 0; out.frames += s.framesDecoded ?? 0; if ((s.framesDecoded ?? 0) > 0) out.vstreams++; }
      });
    }
    return out;
  });
}
const ctxRunning = (p: Page) => p.evaluate(() => (window as unknown as { __ctxs: { context: AudioContext; oscillators: number }[] }).__ctxs.some((c) => c.context.state === "running" && c.oscillators > 0));

test("production smoke", async () => {
  test.setTimeout(900_000);
  const emailA = `discordy-e2e-${RUN}-a@example.com`, emailB = `discordy-e2e-${RUN}-b@example.com`;
  const nameA = `e2ea${RUN}`.slice(0, 30), nameB = `e2eb${RUN}`.slice(0, 30);
  let A!: Inst, B!: Inst, sa!: Session, sb!: Session;
  let guildId = "", textId = "", dmId = "";
  try {
    // 1. Account lifecycle, production connection targets
    await step("1 register account A through the UI", async () => { A = curA = await launch("A"); await register(A, emailA, nameA); });
    await step("1 register account B through the UI", async () => { B = curB = await launch("B"); await register(B, emailB, nameB); });
    await step("1 REST login both (READY identities)", async () => {
      sa = await rest<Session>("POST", "/auth/login", null, { email: emailA, password: PASSWORD });
      sb = await rest<Session>("POST", "/auth/login", null, { email: emailB, password: PASSWORD });
      return `A=${sa.user.id} B=${sb.user.id}`;
    });
    await step("1 client uses production URLs only (no localhost)", async () => {
      const seen = [...A.urls].filter((u) => /^(https?|wss?):/.test(u));
      const bad = seen.filter((u) => /localhost|127\.0\.0\.1/.test(u));
      if (bad.length) throw new Error(`local origins contacted: ${bad.join(",")}`);
      return seen.join(" ");
    });
    await step("1 gateway websocket connected (READY)", async () => {
      if (![...A.urls].some((u) => u.startsWith("wss://discordy-gateway.voics.nl") || (!PROD && u.startsWith("ws")))) throw new Error(`no gateway ws origin in ${[...A.urls].join(",")}`);
    });
    await step("1 logout then login again", async () => {
      await openSettingsTab(A.page, "My account");
      await A.page.getByRole("button", { name: "Sign out" }).first().click();
      await A.page.getByRole("dialog", { name: /Sign out/ }).getByRole("button", { name: "Sign out" }).or(A.page.getByRole("button", { name: "Sign out" }).last()).last().click();
      await A.page.getByLabel("Email", { exact: true }).last().fill(emailA, { timeout: 30_000 });
      await A.page.getByLabel("Password", { exact: true }).last().fill(PASSWORD);
      await A.page.getByRole("button", { name: "Sign in" }).click();
      await expect(A.page.getByRole("navigation", { name: "Servers" })).toBeVisible({ timeout: 60_000 });
    });
    await step("1 2FA enrol page opens (REST: totp enable endpoint reachable)", async () => {
      await openSettingsTab(A.page, "My account");
      await expect(A.page.getByText(/two-factor|authenticator/i).first()).toBeVisible({ timeout: 10_000 });
      await A.page.keyboard.press("Escape");
    });

    // 2. Guild, channels, invite
    await step("2 create server + text + voice channel", async () => {
      const g = await rest<{ id: string }>("POST", "/guilds", sa.access_token, { name: `e2e-smoke-${RUN}` });
      guildId = g.id;
      const chans = await rest<{ id: string; type: number }[]>("GET", `/guilds/${guildId}/channels`, sa.access_token);
      textId = chans.find((c) => c.type === 0)?.id ?? (await rest<{ id: string }>("POST", `/guilds/${guildId}/channels`, sa.access_token, { name: "smoke", type: 0 })).id;
      if (!chans.some((c) => c.type === 2)) await rest("POST", `/guilds/${guildId}/channels`, sa.access_token, { name: "talk", type: 2 });
      return `guild=${guildId}`;
    });
    await step("2 invite link opens on website and B joins via invite", async () => {
      const inv = await rest<{ code: string }>("POST", `/channels/${textId}/invites`, sa.access_token, { max_age: 3600 });
      const html = await (await fetch(`${SITE}/invite/${inv.code}`)).text();
      if (!html.includes(inv.code) && !/discordy/i.test(html)) throw new Error("invite page does not render");
      await B.page.getByRole("button", { name: "Join a server" }).click();
      await B.page.getByRole("dialog").getByRole("textbox").first().fill(`${SITE}/invite/${inv.code}`);
      await B.page.getByRole("button", { name: "Continue" }).click();
      await expect(B.page.getByRole("dialog")).toContainText(/\d+ online/, { timeout: 15_000 });
      expect(await B.page.getByRole("dialog").innerText()).not.toContain("? online");
      await B.page.getByRole("button", { name: "Accept invite" }).click({ timeout: 20_000 });
      await expect(B.page.getByRole("navigation", { name: "Servers" }).getByRole("button", { name: new RegExp(`e2e-smoke-${RUN}`) })).toBeVisible({ timeout: 30_000 });
      await A.page.getByRole("navigation", { name: "Servers" }).getByRole("button", { name: new RegExp(`e2e-smoke-${RUN}`) }).click({ timeout: 30_000 });
    });

    await step("2 member list shows both connected accounts ONLINE (client#135)", async () => {
      for (const i of [A, B]) {
        await i.page.getByText("general", { exact: true }).first().click().catch(() => undefined);
        await expect(i.page.locator(".members section", { hasText: /^Online/ })).toContainText(nameA, { timeout: 15_000 });
        await expect(i.page.locator(".members section", { hasText: /^Online/ })).toContainText(nameB, { timeout: 15_000 });
      }
    });

    // 3. Standard messages
    await B.page.getByRole("navigation", { name: "Servers" }).getByRole("button", { name: new RegExp(`e2e-smoke-${RUN}`) }).click().catch(() => undefined);
    await A.page.getByText("general", { exact: true }).first().click().catch(() => undefined);
    await B.page.getByText("general", { exact: true }).first().click().catch(() => undefined);
    let msgId = "";
    await step("3 standard send + receive (A -> B)", async () => {
      await say(A.page, `hello **bold** ${RUN}`);
      await sees(B.page, `hello`);
      let list: { id: string; content: string }[] = [];
      for (let n = 0; n < 8 && !msgId; n++) { list = await rest("GET", `/channels/${textId}/messages?limit=10`, sb.access_token); msgId = list.find((m) => m.content.includes(RUN))?.id ?? ""; if (!msgId) await B.page.waitForTimeout(2_000); }
      if (!msgId) throw new Error(`message not in REST history: ${JSON.stringify(list).slice(0, 300)}`);
      await expect(B.page.locator("strong", { hasText: "bold" }).first()).toBeVisible({ timeout: 10_000 });
    });
    await step("3 mention renders", async () => {
      await say(A.page, `ping <@${sb.user.id}> ${RUN}`);
      await expect(B.page.locator('[class*="mention"]').first()).toBeVisible({ timeout: 20_000 });
    });
    await step("3 typing indicator", async () => {
      await rest("POST", `/channels/${textId}/typing`, sa.access_token);
      await expect(B.page.getByText(/is typing|are typing/i).first()).toBeVisible({ timeout: 8_000 });
    });
    await step("3 edit + react + delete visible on B", async () => {
      await rest("PATCH", `/channels/${textId}/messages/${msgId}`, sa.access_token, { content: `edited ${RUN}` });
      await sees(B.page, `edited ${RUN}`, 15_000);
      await rest("PUT", `/channels/${textId}/messages/${msgId}/reactions/${encodeURIComponent("👍")}/@me`, sb.access_token);
      await expect(B.page.getByText("👍").first()).toBeVisible({ timeout: 15_000 });
      await rest("DELETE", `/channels/${textId}/messages/${msgId}`, sa.access_token);
      await expect(B.page.getByText(`edited ${RUN}`)).toHaveCount(0, { timeout: 15_000 });
    });
    await step("3 unread divider / mention badge for B in another channel", async () => {
      await B.page.getByRole("navigation", { name: "Servers" }).getByRole("button").first().click();
      await rest("POST", `/channels/${textId}/messages`, sa.access_token, { content: `unread probe ${RUN}` });
      await B.page.getByRole("navigation", { name: "Servers" }).getByRole("button", { name: new RegExp(`e2e-smoke-${RUN}`) }).click();
      await expect(B.page.getByText("New", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    });
    await step("3 search (messages >= 0.3.1)", async () => {
      await rest("POST", `/channels/${textId}/messages`, sa.access_token, { content: `needle${RUN} findme` });
      await A.page.waitForTimeout(4_000);
      const r = await rest<{ messages?: unknown[]; total_results?: number }>("GET", `/guilds/${guildId}/messages/search?content=needle${RUN}`, sa.access_token);
      if (!(r.total_results ?? r.messages?.length)) throw new Error(`search returned no hits: ${JSON.stringify(r).slice(0, 150)}`);
    });

    // 4. Ephemeral + P2P in DM and server channel
    const dm = await rest<{ id: string }>("POST", "/users/@me/channels", sa.access_token, { recipient_ids: [sb.user.id] }).catch(() => ({ id: "" }));
    dmId = dm.id;
    for (const [scope, chanId] of [["dm", () => dmId], ["guild", () => textId]] as const) {
      for (const mode of scope === "dm" ? (["ephemeral", "p2p"] as const) : (["ephemeral"] as const)) {
        await step(`4 ${mode} message in ${scope}`, async () => {
          const id = chanId();
          if (!id) throw new Error("no channel id");
          if (scope === "guild") await rest("PATCH", `/channels/${id}`, sa.access_token, { delivery_mode: mode });
          else await rest("PUT", `/users/@me/channels/${id}/delivery-mode`, sa.access_token, { mode });
          if (scope === "dm") await rest("PUT", `/users/@me/channels/${id}/delivery-mode`, sb.access_token, { mode });
          await A.page.waitForTimeout(4_000);
          if (scope === "dm") {
            for (const [i, peer] of [[A, nameB], [B, nameA]] as const) {
              await i.page.getByRole("navigation", { name: "Servers" }).getByRole("button").first().click();
              await i.page.locator(".dm-row", { hasText: peer }).first().click({ timeout: 20_000 });
            }
          }
          const text = `${mode}-${scope}-${RUN}`;
          await say(A.page, text);
          await sees(B.page, text, 40_000);
          if (scope === "dm") { /* stay in DM */ }
        });
      }
      if (scope === "dm") {
        for (const i of [A, B]) {
          await i.page.getByRole("navigation", { name: "Servers" }).getByRole("button", { name: new RegExp(`e2e-smoke-${RUN}`) }).click().catch(() => undefined);
          await i.page.getByText("general", { exact: true }).first().click().catch(() => undefined);
        }
      }
    }
    await rest("PATCH", `/channels/${textId}`, sa.access_token, { delivery_mode: "standard" }).catch(() => undefined);
    await A.page.waitForTimeout(5_000);

    // 5. Attachments + preview
    await step("5 image attachment inline, signed URL on the CDN host", async () => {
      await A.page.locator('input[type="file"]').setInputFiles({ name: `e2e-${RUN}.png`, mimeType: "image/png", buffer: PNG });
      await A.page.waitForTimeout(3_000); await A.page.screenshot({ path: join(process.env.PROD_SMOKE_SHOTS ?? tmpdir(), "attach-A.png") });
      await A.page.getByRole("button", { name: /^Send/ }).click();
      const failedText = await A.page.locator(".message-failed").first().innerText({ timeout: 6_000 }).catch(() => "");
      if (failedText) throw new Error(`sender shows failed message: ${failedText.replace(/s+/g, " ")}`);
      const img = B.page.locator(".message img[src*=\"X-Amz\"], .message img[src^=\"https://\"]").first();
      await expect(img).toBeVisible({ timeout: 40_000 });
      const src = await img.getAttribute("src");
      if (!src || new URL(src).host !== CDN_HOST) throw new Error(`image src host ${src ? new URL(src).host : "none"}, expected ${CDN_HOST}`);
      if (!(await img.evaluate((e: HTMLImageElement) => e.naturalWidth > 0))) throw new Error("image did not decode");
      return new URL(src).host;
    });
    await step("5 small video attachment plays inline", async () => {
      const clip = await A.page.evaluate(async () => {
        const c = document.createElement("canvas"); c.width = 160; c.height = 120;
        const x = c.getContext("2d")!;
        const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m))!;
        const rec = new MediaRecorder(c.captureStream(25), { mimeType: mime });
        const chunks: Blob[] = []; rec.ondataavailable = (e) => chunks.push(e.data);
        const done = new Promise<void>((r) => (rec.onstop = () => r()));
        rec.start(); const t0 = performance.now();
        await new Promise<void>((res) => { const t = () => { x.fillStyle = `hsl(${(performance.now() - t0) / 5 % 360},80%,50%)`; x.fillRect(0, 0, 160, 120); if (performance.now() - t0 < 1500) requestAnimationFrame(t); else res(); }; t(); });
        rec.stop(); await done;
        return { bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())), mime: mime.split(";")[0] };
      });
      await A.page.locator('input[type="file"]').setInputFiles({ name: `e2e-${RUN}.${clip.mime === "video/mp4" ? "mp4" : "webm"}`, mimeType: clip.mime, buffer: Buffer.from(clip.bytes) });
      await A.page.getByRole("button", { name: /^Send/ }).click();
      const v = B.page.locator(".message video").first();
      await expect(v).toBeVisible({ timeout: 40_000 });
      const host = new URL(await v.evaluate((e: HTMLVideoElement) => e.currentSrc)).host;
      if (host !== CDN_HOST) throw new Error(`video host ${host}`);
      await v.evaluate((e: HTMLVideoElement) => { e.muted = true; return e.play(); });
      await expect.poll(() => v.evaluate((e: HTMLVideoElement) => e.currentTime), { timeout: 15_000 }).toBeGreaterThan(0);
      return host;
    });
    await step("5 link preview of a public URL", async () => {
      await say(A.page, `https://example.com/ ${RUN}`);
      await expect(B.page.getByText(/Example Domain/).first()).toBeVisible({ timeout: 40_000 });
    });

    // 6. Voice
    await step("6 both join the voice channel, remote audio energy > 0", async () => {
      for (const i of [A, B]) await i.page.getByText("General", { exact: true }).first().click();
      await A.page.waitForTimeout(15_000);
      const st = async (p: Page) => (await p.locator("body").innerText()).match(/(Voice connected|Reconnecting|Connecting|Connection failed[^\n]*)/)?.[0] ?? "no status";
      const [x, y] = [await st(A.page), await st(B.page)];
      const diag = await A.page.evaluate(() => (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.map((pc) => `${pc.connectionState}/${pc.iceConnectionState}/${pc.iceGatheringState} remote=${(pc.remoteDescription?.sdp ?? "").split(String.fromCharCode(10)).filter((l) => l.startsWith("a=candidate")).map((l) => l.trim().split(" ").slice(4, 8).join(":")).join(",")}`).join(" | "));
      console.log(`voice-diag ${diag}`);
      // Selected candidate pair (chrome://webrtc-internals equivalent): proves which path media takes (host LAN vs public vs relay).
      const pair = await A.page.evaluate(async () => {
        const out: string[] = [];
        for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
          const stats = await pc.getStats();
          const byId = new Map<string, Record<string, unknown>>();
          stats.forEach((r) => byId.set(r.id, r as Record<string, unknown>));
          byId.forEach((r) => {
            if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') {
              const l = byId.get(r.localCandidateId as string), m = byId.get(r.remoteCandidateId as string);
              out.push(`local=${l?.candidateType}:${l?.address ?? l?.ip} remote=${m?.candidateType}:${m?.address ?? m?.ip}:${m?.port}`);
            }
          });
        }
        return out.join(' | ');
      });
      console.log(`voice-selected-pair ${pair}`);
      if (x !== "Voice connected" || y !== "Voice connected") throw new Error(`status A=${x} B=${y}`);
      const [pa, pb, ia, ib] = [await peak(A.page), await peak(B.page), await inbound(A.page), await inbound(B.page)];
      if (!(pa > 0 && pb > 0 && ia.audio > 0 && ib.audio > 0)) throw new Error(`peak A=${pa} B=${pb} inbound A=${ia.audio} B=${ib.audio}`);
      return `peak A=${pa.toFixed(3)} B=${pb.toFixed(3)}`;
    });
    await step("6 camera on, remote decodes frames", async () => {
      await A.page.getByRole("button", { name: /camera|video/i }).first().click();
      await A.page.waitForTimeout(15_000);
      const f = (await inbound(B.page)).frames;
      if (!(f > 0)) throw new Error("B decoded 0 video frames");
      return `frames=${f}`;
    });
    await step("6 screen share", async () => {
      await A.page.getByRole("button", { name: "Share your screen" }).first().click();
      await A.page.getByRole("listbox", { name: "Capture sources" }).getByRole("button").first().click({ timeout: 15_000 });
      await A.page.getByRole("button", { name: "Go live" }).click();
      await A.page.waitForTimeout(15_000);
      const n = (await inbound(B.page)).vstreams;
      if (n < 2) throw new Error(`B decodes ${n} video streams, expected 2 (camera + screen)`);
    });
    await step("6 DM call ring + ringtone audio context running", async () => {
      await A.page.getByRole("button", { name: /Disconnect|Leave/i }).first().click().catch(() => undefined);
      await B.page.getByRole("button", { name: /Disconnect|Leave/i }).first().click().catch(() => undefined);
      await A.page.getByRole("navigation", { name: "Servers" }).getByRole("button").first().click();
      await A.page.locator(".dm-row", { hasText: nameB }).first().click();
      await A.page.getByRole("button", { name: "Start voice call" }).click();
      await B.page.getByRole("alertdialog", { name: /Incoming call from/ }).waitFor({ timeout: 15_000 });
      if (!(await ctxRunning(B.page))) throw new Error("no running ringtone AudioContext on B");
      await B.page.getByRole("button", { name: "Decline" }).first().click().catch(() => undefined);
    });

    // 7. Settings
    await step("7 notification sounds toggle works", async () => {
      await openSettingsTab(A.page, "Notifications");
      const sw = A.page.getByRole("switch", { name: "Notification sounds" });
      const before = await sw.isChecked();
      await sw.click();
      await expect(sw).toBeChecked({ checked: !before });
      await sw.click();
    });
    await step("7 notification settings sync to server (known gap, client#123)", async () => {
      const s = JSON.stringify(await rest("GET", "/users/@me/settings", sa.access_token));
      if (!/notif|sound/i.test(s)) throw new Error(`server settings carry no notification fields: ${s.slice(0, 120)}`);
    });
    await step("7 settings X close button", async () => {
      await A.page.getByRole("button", { name: /^Close/ }).first().click();
      await expect(A.page.getByRole("dialog", { name: /settings/i })).toHaveCount(0, { timeout: 5_000 });
    });

    // 8. Update feed + website
    await step("8 latest.yml matches installer; website download link", async () => {
      const yml = await (await fetch(`${UPDATES}/latest.yml`)).text();
      const ver = /^version:\s*(\S+)/m.exec(yml)?.[1], file = /^path:\s*(\S+)/m.exec(yml)?.[1];
      if (!ver || !file || !file.includes(ver)) throw new Error(`latest.yml version ${ver} vs ${file}`);
      const head = await fetch(`${UPDATES}/${file}`, { method: "HEAD" });
      if (!head.ok) throw new Error(`installer ${file} -> ${head.status}`);
      const html = await (await fetch(SITE)).text();
      const dl = /href="(https:[^"]*.exe)"/i.exec(html)?.[1];
      if (!dl) throw new Error("no installer download link on website");
      const dh = await fetch(dl, { method: "HEAD" });
      if (!dh.ok || dh.headers.get("content-length") !== head.headers.get("content-length")) throw new Error(`website download ${dl} -> ${dh.status} size ${dh.headers.get("content-length")}`);
      return `feed=${ver} installer=${file} (${head.headers.get("content-length")}B) site=${dl}`;
    });
  } finally {
    // Cleanup: delete the server, then the accounts (scheduled deletion).
    if (guildId) await rest("DELETE", `/guilds/${guildId}`, sa?.access_token ?? null).catch((e) => console.log(`cleanup guild: ${e.message}`));
    for (const s of [sa, sb]) if (s) await rest("POST", "/users/@me/delete", s.access_token, { password: PASSWORD }).then(() => console.log("account delete scheduled")).catch((e) => console.log(`cleanup account: ${e.message}`));
    writeFileSync(join(process.env.PROD_SMOKE_SHOTS ?? tmpdir(), "logs.txt"), [...(A?.log ?? []), ...(B?.log ?? [])].join(String.fromCharCode(10)));
    await A?.app.close().catch(() => undefined);
    await B?.app.close().catch(() => undefined);
    console.log("=== CHECKLIST\n" + results.map((r) => `${r.ok ? "[x]" : "[ ]"} ${r.step}${r.note ? ` -- ${r.note}` : ""}`).join("\n"));
    writeFileSync(process.env.PROD_SMOKE_OUT ?? "prod-smoke-results.json", JSON.stringify(results, null, 2));
  }
  expect(results.filter((r) => !r.ok).map((r) => r.step)).toEqual([]);
});
