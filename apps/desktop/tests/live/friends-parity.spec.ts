// Live (local stack on :18000): friends page. A adds B by username (clear error for an unknown name), B sees the
// incoming request with a badge and accepts, A finds B through search and sees call buttons; outgoing requests
// can be cancelled; Active Now lists a friend in voice is covered by unit tests.
import { expect, test } from "@playwright/test";
import { close, ensureUser, launch, stamp, type Instance } from "./matrix-helpers";

process.env.DISCORDY_E2E = "1";

const openFriends = async (page: Instance["page"]) => {
  await page.getByRole("button", { name: /Friends/ }).first().click({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Friends" })).toBeVisible({ timeout: 20_000 });
};

test("add by username, accept, search, call buttons, cancel outgoing", async () => {
  test.setTimeout(240_000);
  const id = stamp();
  const a = await ensureUser(`fra${id}`);
  const b = await ensureUser(`frb${id}`);
  const c = await ensureUser(`frc${id}`);
  let A: Instance | undefined;
  let B: Instance | undefined;
  try {
    A = await launch("A", { user: a.user.username });
    B = await launch("B", { user: b.user.username });
    await openFriends(A.page);
    await openFriends(B.page);

    await A.page.getByRole("tab", { name: /Add friend/ }).click();
    await A.page.getByLabel("Username").fill(`nobody${id}zz`);
    await A.page.getByRole("button", { name: "Send request" }).click();
    await expect(A.page.locator(".add-friend-result")).toContainText("could not find anyone", { timeout: 20_000 });

    for (const name of [b.user.username, c.user.username]) {
      await A.page.getByLabel("Username").fill(name);
      await A.page.getByRole("button", { name: "Send request" }).click();
      await expect(A.page.locator(".add-friend-result")).toContainText(`sent to ${name}`, { timeout: 20_000 });
    }

    // A: both requests are outgoing; cancel C's.
    await A.page.getByRole("tab", { name: /Pending/ }).click();
    await expect(A.page.getByText(/^Outgoing — 2/)).toBeVisible({ timeout: 20_000 });
    await A.page.locator(".friend-row", { hasText: c.user.username }).getByRole("button", { name: "Cancel request" }).click();
    await expect(A.page.locator(".friend-row", { hasText: c.user.username })).toHaveCount(0, { timeout: 20_000 });

    // B: incoming request with a badge, accept.
    await B.page.getByRole("tab", { name: /Pending/ }).click();
    await expect(B.page.getByText(/^Incoming — 1/)).toBeVisible({ timeout: 30_000 });
    await B.page.locator(".friend-row", { hasText: a.user.username }).getByRole("button", { name: "Accept" }).click();

    // A: B is now in All, found by search, with message and call buttons.
    await A.page.getByRole("tab", { name: /^All/ }).click();
    await A.page.getByLabel("Search friends").fill(b.user.username.slice(0, 6));
    const row = A.page.locator(".friend-row", { hasText: b.user.username });
    await expect(row).toBeVisible({ timeout: 30_000 });
    for (const label of ["Message", "Voice call", "Video call", "Remove friend"]) await expect(row.getByRole("button", { name: label })).toBeVisible();
    await A.page.getByLabel("Search friends").fill("zzzz-no-match");
    await expect(A.page.getByText("No matches")).toBeVisible();
  } finally {
    await close(A);
    await close(B);
  }
});
