// Live (local stack on :18000): automatic idle -> online, manual DND is respected, custom status shows in the
// member list, and the member list groups, counts and searches. Two Electron clients: A watches, B goes idle.
// The OS idle clock is pinned from the main process (honoured only because DISCORDY_E2E=1).
import { expect, test } from "@playwright/test";
import { close, ensureUser, launch, rest, stamp, type Instance } from "./matrix-helpers";

process.env.DISCORDY_E2E = "1";

const setIdleSeconds = (i: Instance, seconds: number) => i.app.evaluate((_electron, s) => void ((globalThis as { __e2eIdleSeconds?: number }).__e2eIdleSeconds = s), seconds);

const rowOf = (page: Instance["page"], name: string) => page.locator(".member-row", { hasText: name }).first();

async function openGuild(page: Instance["page"], guildName: string): Promise<void> {
  await page.getByRole("navigation", { name: "Servers" }).getByRole("button", { name: guildName }).click({ timeout: 30_000 });
  await expect(page.getByRole("complementary", { name: "Members" })).toBeVisible({ timeout: 20_000 });
}

test("idle after OS inactivity, back online on activity, DND respected, custom status and member list", async () => {
  test.setTimeout(300_000);
  const id = stamp();
  const a = await ensureUser(`pia${id}`);
  const b = await ensureUser(`pib${id}`);
  const guildName = `pi${id}`;
  const guild = await rest<{ id: string }>("POST", "/guilds", a.access_token, { name: guildName });
  const channels = await rest<{ id: string; type: number }[]>("GET", `/guilds/${guild.id}/channels`, a.access_token);
  const invite = await rest<{ code: string }>("POST", `/channels/${channels.find((c) => c.type === 0)!.id}/invites`, a.access_token, {});
  await rest("POST", `/invites/${invite.code}`, b.access_token);
  // A hoisted role for B so the member list shows a role group.
  const role = await rest<{ id: string }>("POST", `/guilds/${guild.id}/roles`, a.access_token, { name: "Crew", hoist: true });
  await rest("PUT", `/guilds/${guild.id}/members/${b.user.id}/roles/${role.id}`, a.access_token);

  let A: Instance | undefined;
  let B: Instance | undefined;
  try {
    A = await launch("A", { user: a.user.username });
    B = await launch("B", { user: b.user.username });
    await setIdleSeconds(B, 0);
    await openGuild(A.page, guildName);
    await openGuild(B.page, guildName);

    // Member list: hoisted role group with count, owner crown, search.
    await expect(A.page.getByRole("heading", { level: 3, name: /^Crew\s*1$/ })).toBeVisible({ timeout: 30_000 });
    await expect(rowOf(A.page, a.user.username).getByLabel("Server owner")).toBeVisible();
    await expect(rowOf(A.page, b.user.username).locator(".status-dot.status-online")).toBeVisible({ timeout: 30_000 });

    // OS idle past the 10 minute default: B turns Idle for A.
    await setIdleSeconds(B, 11 * 60);
    await expect(rowOf(A.page, b.user.username).locator(".status-dot.status-idle")).toBeVisible({ timeout: 40_000 });
    // Activity: back to Online.
    await setIdleSeconds(B, 0);
    await expect(rowOf(A.page, b.user.username).locator(".status-dot.status-online")).toBeVisible({ timeout: 40_000 });

    // Manual Do Not Disturb is never overridden by idle.
    await B.page.getByRole("button", { name: "Account and status" }).click();
    await B.page.getByRole("menuitem", { name: "Do not disturb" }).click();
    await expect(rowOf(A.page, b.user.username).locator(".status-dot.status-dnd")).toBeVisible({ timeout: 30_000 });
    await setIdleSeconds(B, 11 * 60);
    await B.page.waitForTimeout(13_000);
    await expect(rowOf(A.page, b.user.username).locator(".status-dot.status-dnd")).toBeVisible();
    await setIdleSeconds(B, 0);
    await B.page.getByRole("button", { name: "Account and status" }).click();
    await B.page.getByRole("menuitem", { name: "Online" }).click();
    await expect(rowOf(A.page, b.user.username).locator(".status-dot.status-online")).toBeVisible({ timeout: 30_000 });

    // Custom status with an expiry shows as the activity line.
    await B.page.getByRole("button", { name: "Account and status" }).click();
    await B.page.getByRole("menuitem", { name: "Set custom status" }).click();
    await B.page.getByLabel("What's happening?").fill("deep in the zone");
    await B.page.getByLabel("Clear after").selectOption("1h");
    await B.page.getByRole("button", { name: "Save" }).click();
    await expect(rowOf(A.page, b.user.username).locator(".member-activity")).toHaveText("deep in the zone", { timeout: 30_000 });

    // Search members.
    await A.page.getByLabel("Search members").fill(b.user.username.slice(0, 6));
    await expect(A.page.getByRole("heading", { level: 3, name: /Search results\s*1$/ })).toBeVisible();
    await expect(A.page.locator(".member-row")).toHaveCount(1);
  } finally {
    await close(A, B);
  }
});
