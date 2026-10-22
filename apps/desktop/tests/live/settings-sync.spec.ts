// Live: a preference changed on one device reaches the account's other device (client#123).
import { expect, test, type Page } from "@playwright/test";
import { close, dump, ensureUser, launch, rest, stamp, type Instance } from "./matrix-helpers";

async function openSettingsTab(p: Page, tab: string) {
  await p.getByRole("button", { name: "User settings" }).click();
  await p.getByRole("dialog").getByText(tab, { exact: true }).first().click();
}
const root = (p: Page, attr: "theme" | "accent") => p.evaluate((a) => document.documentElement.dataset[a], attr);

test("a theme, accent and notification sound change on device 1 appears on device 2 and the server", async () => {
  test.setTimeout(240_000);
  const me = await ensureUser(`sync${stamp()}`);
  const all: Instance[] = [];
  try {
    const d1 = await launch("d1", { user: me.user.username });
    const d2 = await launch("d2", { user: me.user.username });
    all.push(d1, d2);
    expect(await root(d2.page, "theme")).toBe("dark");

    await openSettingsTab(d1.page, "Appearance");
    await d1.page.getByRole("radio", { name: "Light" }).click();
    await d1.page.getByRole("radio", { name: "Sky" }).click();
    await expect.poll(() => root(d2.page, "theme"), { timeout: 15_000 }).toBe("light");
    await expect.poll(() => root(d2.page, "accent"), { timeout: 15_000 }).toBe("sky");

    await d1.page.keyboard.press("Escape");
    await openSettingsTab(d1.page, "Notifications");
    const sw1 = d1.page.getByRole("switch", { name: "Notification sounds" });
    await sw1.click();
    await expect(sw1).not.toBeChecked();
    await openSettingsTab(d2.page, "Notifications");
    await expect(d2.page.getByRole("switch", { name: "Notification sounds" })).not.toBeChecked({ timeout: 15_000 });

    const server = await rest<{ theme: string; preferences: Record<string, unknown> }>("GET", "/users/@me/settings", me.access_token);
    expect(server.theme).toBe("light");
    expect(server.preferences).toMatchObject({ accent: "sky", notify_sounds: false });

    // a brand-new device of the same account picks the settings up from READY
    const d3 = await launch("d3", { user: me.user.username });
    all.push(d3);
    await expect.poll(() => root(d3.page, "theme"), { timeout: 15_000 }).toBe("light");
    console.log("RESULT settings propagated to d2 live, and to a fresh d3 from READY; server=" + JSON.stringify(server.preferences));
  } finally {
    await dump("settings-sync", ...all);
    await close(...all);
  }
});
