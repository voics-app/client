// Live check: alice sends bob a DM in every delivery mode (Standard, Ephemeral, P2P) and bob must
// see each message. Not part of CI; run against gitops/local on :18000.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE = process.env.LIVE_BASE ?? "http://127.0.0.1:18000";
const PASSWORD = "Discordy-dev-2026!";

async function rest<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function launch(name: string): Promise<{ app: ElectronApplication; page: Page; log: string[] }> {
  const log: string[] = [];
  const app = await electron.launch({
    args: [resolve(__dirname, "../..")],
    env: {
      ...process.env,
      DISCORDY_USER_DATA_DIR: mkdtempSync(join(tmpdir(), "discordy-live-")),
      DISCORDY_API_URL: BASE,
      DISCORDY_GATEWAY_URL: BASE.replace(/^http/, "ws"),
      DISCORDY_CDN_URL: `${BASE}/cdn`,
      ELECTRON_RENDERER_URL: "",
    } as Record<string, string>,
  });
  app.process().stderr?.on("data", (d) => log.push(`[${name} main!] ${String(d).trim()}`));
  const page = await app.firstWindow();
  page.on("pageerror", (e) => log.push(`[${name} pageerror] ${e.stack ?? e.message}`));
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/gateway")) return;
    const show = (dir: string) => (f: { payload: string | Buffer }) => {
      const text = typeof f.payload === "string" ? f.payload : "";
      const op = /"op":\s*(\d+)/.exec(text)?.[1];
      if (process.env.LIVE_HTTP_ALL && op && op !== "1" && op !== "11" && op !== "0") log.push(`[${name} gw${dir}] op${op} ${text.slice(0, 120)}`);
      if (!/"op":\s*(20|21|22)\b/.test(text)) return;
      try {
        const frame = JSON.parse(text) as { op: number; d: { content_type?: string; channel_id?: string; sender_device_id?: string; recipients?: { device_id: string }[]; epoch?: number } };
        const d = frame.d ?? {};
        log.push(`[${name} gw${dir}] op${frame.op} ${d.content_type ?? ""} ch=${d.channel_id ?? ""} from=${d.sender_device_id ?? ""} to=${(d.recipients ?? []).map((r) => r.device_id).join(",")} epoch=${d.epoch ?? ""}`);
      } catch {
        log.push(`[${name} gw${dir}] ${text.slice(0, 200)}`);
      }
    };
    ws.on("framesent", show(">"));
    ws.on("framereceived", show("<"));
  });
  page.on("response", async (r) => {
    if (process.env.LIVE_HTTP_ALL && /devices|key-packages|messages|e2ee/.test(r.url())) log.push(`[${name} http ${r.status()}] ${r.request().method()} ${r.url().replace(BASE, "")}`);
    else if (r.status() >= 400) log.push(`[${name} http ${r.status()}] ${r.request().method()} ${r.url().replace(BASE, "")} ${(await r.text().catch(() => "")).slice(0, 300)}`);
  });
  page.on("console", (m) => {
    log.push(`[${name} ${m.type()}] ${m.text().slice(0, 400)}`);
  });
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => localStorage.setItem("discordy.debug.privacy", "1"));
  await page.reload();
  await page.getByLabel("Email").fill(`${name}@discordy.local`, { timeout: 30_000 });
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Servers" })).toBeVisible({ timeout: 75_000 });
  return { app, page, log };
}

async function openDm(page: Page, peer: string): Promise<void> {
  await page.getByRole("navigation", { name: "Servers" }).getByRole("button").first().click();
  await page.locator(".dm-row", { hasText: peer }).first().click({ timeout: 15_000 });
}

test("alice reaches bob in every delivery mode", async () => {
  test.setTimeout(300_000);
  const a = await rest<{ access_token: string; user: { id: string } }>("POST", "/auth/login", null, { email: "alice@discordy.local", password: PASSWORD });
  const b = await rest<{ access_token: string; user: { id: string } }>("POST", "/auth/login", null, { email: "bob@discordy.local", password: PASSWORD });
  const dm = await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id] });

  const alice = await launch("alice");
  const bob = await launch("bob");
  const results: Record<string, boolean> = {};
  try {
    await openDm(alice.page, "bob");
    await openDm(bob.page, "alice");
    for (const mode of ["standard", "ephemeral", "p2p"] as const) {
      await rest("PUT", `/users/@me/channels/${dm.id}/delivery-mode`, a.access_token, { mode });
      await alice.page.waitForTimeout(3_000);
      const text = `live ${mode} ${Date.now()}`;
      const composer = alice.page.getByRole("textbox", { name: /^Message @/ });
      await composer.fill(text);
      await composer.press("Enter");
      results[mode] = await bob.page
        .getByText(text)
        .first()
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      const badge = await alice.page.locator(".mode-badge").first().innerText().catch(() => "?");
      console.log(`--- ${mode}: bob sees it = ${results[mode]} (alice badge: ${badge.replace(/\s+/g, " ")})`);
      const alerts = [
        ...(await alice.page.locator('[class*="toast"]').allInnerTexts().catch(() => [])),
        `draft="${await composer.inputValue().catch(() => "?")}"`,
      ];
      if (alerts.length) console.log(`--- ${mode}: alice alerts ${JSON.stringify(alerts).slice(0, 600)}`);
    }
  } finally {
    await rest("PUT", `/users/@me/channels/${dm.id}/delivery-mode`, a.access_token, { mode: null }).catch(() => undefined);
    console.log([...alice.log, ...bob.log].slice(-60).join("\n"));
    await alice.app.close().catch(() => undefined);
    await bob.app.close().catch(() => undefined);
  }
  expect(results).toEqual({ standard: true, ephemeral: true, p2p: true });
});
