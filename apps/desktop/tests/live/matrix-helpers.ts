// Shared helpers for the delivery-mode matrix specs (live, against gitops/local on :18000).
import { _electron as electron, expect, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const BASE = process.env.LIVE_BASE ?? "http://127.0.0.1:18000";
export const PASSWORD = "Discordy-dev-2026!";
export type Mode = "standard" | "ephemeral" | "p2p";

export interface Session {
  access_token: string;
  user: { id: string; username: string };
}

export async function rest<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Logs a seed user in; creates the account first when it does not exist (carol, dave, ...). */
export async function ensureUser(name: string): Promise<Session> {
  const email = `${name}@discordy.local`;
  const login = () => rest<Session>("POST", "/auth/login", null, { email, password: PASSWORD });
  try {
    return await login();
  } catch {
    await rest("POST", "/auth/register", null, { email, username: name, password: PASSWORD }).catch(() => undefined);
    return login();
  }
}

export async function setMode(token: string, channelId: string, mode: Mode | null): Promise<void> {
  await rest("PUT", `/users/@me/channels/${channelId}/delivery-mode`, token, { mode });
}

export interface Instance {
  name: string;
  app: ElectronApplication;
  page: Page;
  log: string[];
  dataDir: string;
  /** Gateway ops 20/21/22 seen on this instance, newest last. */
  ops: { dir: "<" | ">"; op: number; content_type?: string; epoch?: number; ids: string[] }[];
}

export interface LaunchOptions {
  /** Account to sign in as; defaults to `${name}@discordy.local`. */
  user?: string;
  /** Reuse a user-data dir: a restart of the same device, or `undefined` for a brand new device. */
  dataDir?: string;
  /** Skip the sign-in form (the session persists in the data dir). */
  resume?: boolean;
}

/**
 * Fail fast when the native MLS/crypto module was never built in this checkout (fresh or copied worktree):
 * without it every Ephemeral (MLS) and P2P message silently times out (client#142). Fix: `pnpm build:native`.
 */
export function assertNativeCryptoBuilt(): void {
  const dir = resolve(__dirname, "../../../../native/crypto");
  const built = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".node"));
  if (!built) throw new Error(`native crypto module missing in ${dir}; run \`pnpm build:native\` in the worktree root before live specs`);
}

export function newDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "discordy-live-"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function launch(name: string, opts: LaunchOptions = {}): Promise<Instance> {
  assertNativeCryptoBuilt();
  const log: string[] = [];
  const ops: Instance["ops"] = [];
  const dataDir = opts.dataDir ?? newDataDir();
  const app = await electron.launch({
    args: [resolve(__dirname, "../.."), ...(opts.chromiumArgs ?? [])],
    env: {
      ...process.env,
      DISCORDY_USER_DATA_DIR: dataDir,
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
    const show = (dir: "<" | ">") => (f: { payload: string | Buffer }) => {
      const text = typeof f.payload === "string" ? f.payload : "";
      if (!/"op":\s*(20|21|22)\b/.test(text)) return;
      try {
        const frame = JSON.parse(text) as { op: number; d: { content_type?: string; epoch?: number; mls_epoch?: number; message_id?: string; message_ids?: string[]; recipients?: { device_id: string }[] } };
        const d = frame.d ?? {};
        const ids = d.message_ids ?? (d.message_id ? [d.message_id] : []);
        ops.push({ dir, op: frame.op, content_type: d.content_type, epoch: d.mls_epoch ?? d.epoch, ids });
        log.push(`[${name} gw${dir}] op${frame.op} ${d.content_type ?? ""} to=${(d.recipients ?? []).length} ids=${ids.join(",")}`);
      } catch {
        log.push(`[${name} gw${dir}] ${text.slice(0, 200)}`);
      }
    };
    ws.on("framesent", show(">"));
    ws.on("framereceived", show("<"));
  });
  page.on("response", async (r) => {
    if (r.status() >= 400) log.push(`[${name} http ${r.status()}] ${r.request().method()} ${r.url().replace(BASE, "")} ${(await r.text().catch(() => "")).slice(0, 300)}`);
  });
  page.on("console", (m) => log.push(`[${name} ${m.type()}] ${m.text().slice(0, 400)}`));
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => localStorage.setItem("discordy.debug.privacy", "1"));
  await page.reload();
  if (!opts.resume) {
    await page.getByLabel("Email").fill(`${opts.user ?? name}@discordy.local`, { timeout: 30_000 });
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByRole("navigation", { name: "Servers" })).toBeVisible({ timeout: 75_000 });
  return { name, app, page, log, dataDir, ops };
}

export async function close(...instances: (Instance | undefined)[]): Promise<void> {
  for (const i of instances) await i?.app.close().catch(() => undefined);
}

export async function openDm(page: Page, peer: string): Promise<void> {
  await page.getByRole("navigation", { name: "Servers" }).getByRole("button").first().click();
  await page.locator(".dm-row", { hasText: peer }).first().click({ timeout: 20_000 });
}

export function composer(page: Page) {
  return page.getByRole("textbox", { name: /^Message / });
}

export async function say(page: Page, text: string): Promise<void> {
  const box = composer(page);
  await box.fill(text);
  await box.press("Enter");
}

/** True when `text` shows up in the open conversation within `timeout`. */
export async function sees(page: Page, text: string, timeout = 30_000): Promise<boolean> {
  return page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ timeout })
    .then(() => true)
    .catch(() => false);
}

export async function dump(title: string, ...instances: Instance[]): Promise<void> {
  console.log(`===== ${title}`);
  for (const i of instances) console.log(i.log.slice(-40).join("\n"));
}

export const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
