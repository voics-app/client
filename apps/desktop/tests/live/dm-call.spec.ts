// Live check: alice calls bob in their DM. Both must connect, receive audio (and video once the
// camera is on), and neither renderer may crash. Not part of CI; run against gitops/local on :18000.
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE = process.env.LIVE_BASE ?? "http://127.0.0.1:18000";
const PASSWORD = "Discordy-dev-2026!";

async function rest<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// Records every RTCPeerConnection so the test can read inbound RTP stats.
const recordPeers = () => {
  const Native = window.RTCPeerConnection;
  const list: RTCPeerConnection[] = [];
  (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = list;
  window.RTCPeerConnection = class extends Native {
    constructor(config?: RTCConfiguration) {
      super(config);
      list.push(this);
    }
  } as typeof RTCPeerConnection;
};

async function launch(
  name: string,
): Promise<{ app: ElectronApplication; page: Page; log: string[] }> {
  const log: string[] = [];
  const app = await electron.launch({
    args: [
      resolve(__dirname, "../.."),
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
    env: {
      ...process.env,
      DISCORDY_USER_DATA_DIR: mkdtempSync(join(tmpdir(), "discordy-live-")),
      DISCORDY_API_URL: BASE,
      DISCORDY_GATEWAY_URL: BASE.replace(/^http/, "ws"),
      DISCORDY_CDN_URL: `${BASE}/cdn`,
      ELECTRON_RENDERER_URL: "",
    } as Record<string, string>,
  });
  app
    .process()
    .stdout?.on("data", (d) => log.push(`[${name} main] ${String(d).trim()}`));
  app
    .process()
    .stderr?.on("data", (d) => log.push(`[${name} main!] ${String(d).trim()}`));
  const page = await app.firstWindow();
  page.on("pageerror", (e) =>
    log.push(`[${name} pageerror] ${e.stack ?? e.message}`),
  );
  page.on("crash", () => log.push(`[${name}] RENDERER CRASHED`));
  page.on("console", (m) => {
    if (
      m.type() === "error" ||
      m.type() === "warning" ||
      /voice|dave|call|rtc/i.test(m.text())
    )
      log.push(`[${name} ${m.type()}] ${m.text()}`);
  });
  page.on("websocket", (ws) => {
    log.push(`[${name} ws open] ${ws.url().slice(0, 120)}`);
    if (ws.url().includes("/gateway")) return;
    const show = (dir: string) => (f: { payload: string | Buffer }) => {
      const text =
        typeof f.payload === "string"
          ? f.payload
          : `<binary ${f.payload.length}>`;
      if (process.env.LIVE_WS_LOG)
        log.push(`[${name} ws${dir}] ${text.slice(0, 400)}`);
    };
    ws.on("framesent", show(">"));
    ws.on("framereceived", show("<"));
  });
  await page.addInitScript(recordPeers);
  await page.reload();
  await page
    .getByLabel("Email")
    .fill(`${name}@discordy.local`, { timeout: 30_000 });
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  try {
    await expect(page.getByRole("navigation", { name: "Servers" })).toBeVisible(
      { timeout: 75_000 },
    );
  } catch (e) {
    await page.screenshot({
      path: `C:/Users/Karma/AppData/Local/Temp/claude/C--Users-Karma-Projects-discordy-voics/24666c3e-bc3c-46e0-abe3-7085afa10e29/scratchpad/stuck-${name}.png`,
    });
    console.log(`[${name}] html=${(await page.content()).slice(0, 600)}`);
    console.log(
      `[${name}] sign-in stuck. Body: ${(await page.locator("body").innerText()).slice(0, 400)} | ${log.join(" | ")}`,
    );
    throw e;
  }
  return { app, page, log };
}

async function inbound(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    const out: Record<string, number> = {};
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] })
      .__pcs ?? []) {
      const stats = await pc.getStats();
      stats.forEach((s) => {
        if (s.type === "inbound-rtp")
          out[`in-${s.kind}`] =
            (out[`in-${s.kind}`] ?? 0) + (s.bytesReceived ?? 0);
        if (s.type === "outbound-rtp") {
          out[`out-${s.kind}`] =
            (out[`out-${s.kind}`] ?? 0) + (s.bytesSent ?? 0);
          out[`ssrc-out-${s.kind}`] = s.ssrc;
        }
        if (s.type === "inbound-rtp" && s.kind === "video") {
          out["frames-decoded"] =
            (out["frames-decoded"] ?? 0) + (s.framesDecoded ?? 0);
          Object.assign(out, {
            vpk: s.packetsReceived,
            vlost: s.packetsLost,
            vfr: s.framesReceived,
            vkey: s.keyFramesDecoded,
            vpli: s.pliCount,
            vnack: s.nackCount,
            vssrc: s.ssrc,
            vcodec: s.codecId,
          });
        }
        if (s.type === "outbound-rtp" && s.kind === "video")
          Object.assign(out, {
            opli: s.pliCount,
            okey: s.keyFramesEncoded,
            ofr: s.framesEncoded,
            oenc: s.encoderImplementation,
          });
      });
      out[`pc-${pc.connectionState}`] =
        (out[`pc-${pc.connectionState}`] ?? 0) + 1;
      pc.getTransceivers().forEach((t, i) => {
        const tr = t.sender.track;
        (out as Record<string, unknown>)[`tx${i}`] =
          `${t.mid}:${t.direction}/${t.currentDirection}:${tr ? `${tr.kind}:${tr.readyState}:${tr.enabled ? "on" : "off"}:${tr.muted ? "muted" : ""}` : "no-track"}:${(t.sender as unknown as { transform?: unknown }).transform ? "xform" : ""}`;
      });
    }
    return out;
  });
}

async function callStatus(page: Page): Promise<string> {
  const text = await page.locator("body").innerText();
  return (
    text.match(
      /(Voice connected|Reconnecting|Connecting|Connection failed[^\n]*)/,
    )?.[0] ?? "no status text"
  );
}

async function openDm(page: Page, peer: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Servers" })
    .getByRole("button")
    .first()
    .click();
  await page
    .locator(".dm-row", { hasText: peer })
    .first()
    .click({ timeout: 15_000 });
}

test("alice calls bob in a DM", async () => {
  test.setTimeout(240_000);
  const a = await rest<{ access_token: string; user: { id: string } }>(
    "POST",
    "/auth/login",
    null,
    { email: "alice@discordy.local", password: PASSWORD },
  );
  const b = await rest<{ access_token: string; user: { id: string } }>(
    "POST",
    "/auth/login",
    null,
    { email: "bob@discordy.local", password: PASSWORD },
  );
  await rest("POST", "/users/@me/channels", a.access_token, {
    recipient_ids: [b.user.id],
  });

  const alice = await launch("alice");
  const bob = await launch("bob");
  const dump = async (label: string) => {
    console.log(
      `--- ${label}: alice=${await callStatus(alice.page).catch(() => "n/a")} ${JSON.stringify(await inbound(alice.page).catch(() => ({})))}`,
    );
    console.log(
      `--- ${label}: bob=${await callStatus(bob.page).catch(() => "n/a")} ${JSON.stringify(await inbound(bob.page).catch(() => ({})))}`,
    );
  };
  try {
    await openDm(alice.page, "bob");
    await alice.page.getByRole("button", { name: "Start voice call" }).click();
    await alice.page.waitForTimeout(6_000);
    const bobRinging = /incoming|is calling|ringing|join call/i.test(
      await bob.page.locator("body").innerText(),
    );
    console.log(`--- bob sees a ring: ${bobRinging}`);
    await dump("alice alone");

    await openDm(bob.page, "alice");
    await bob.page
      .getByRole("button", { name: /Start voice call|Join call/ })
      .click();
    await bob.page.waitForTimeout(10_000);
    await dump("both joined");

    await alice.page
      .getByRole("button", { name: /camera|video/i })
      .first()
      .click()
      .catch((e) => console.log(`camera button: ${e}`));
    await alice.page.waitForTimeout(20_000);
    await dump("alice camera on");
    const a = await inbound(alice.page);
    const b = await inbound(bob.page);
    expect(a["in-audio"] ?? 0, "alice hears bob").toBeGreaterThan(0);
    expect(b["in-audio"] ?? 0, "bob hears alice").toBeGreaterThan(0);
    expect(b["frames-decoded"] ?? 0, "bob sees alice's camera").toBeGreaterThan(
      0,
    );
  } finally {
    console.log([...alice.log, ...bob.log].join("\n"));
    await alice.app.close().catch(() => undefined);
    await bob.app.close().catch(() => undefined);
  }
});
