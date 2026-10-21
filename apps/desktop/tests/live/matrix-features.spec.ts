// Matrix: attachments / edits / deletes / reactions per delivery mode. Where a feature is intentionally
// unsupported (edit, react, delete-for-everyone in Ephemeral and P2P) the UI must say so.
import { expect, test } from "@playwright/test";
import { close, dump, ensureUser, launch, openDm, rest, say, sees, setMode, stamp, type Instance, type Mode, type Session } from "./matrix-helpers";

test.describe.configure({ mode: "serial" });

let a: Session;
let b: Session;
let dmId: string;
let alice: Instance;
let bob: Instance;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const id = stamp();
  a = await ensureUser(`mfa${id}`);
  b = await ensureUser(`mfb${id}`);
  dmId = (await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id] })).id;
  alice = await launch("alice", { user: a.user.username });
  bob = await launch("bob", { user: b.user.username });
  await openDm(alice.page, b.user.username);
  await openDm(bob.page, a.user.username);
});

test.afterAll(async () => {
  await setMode(a.access_token, dmId, null).catch(() => undefined);
  await dump("features", alice, bob);
  await close(alice, bob);
});

for (const mode of ["standard", "ephemeral", "p2p"] as const satisfies readonly Mode[]) {
  test(`${mode}: attachment arrives and is readable by the peer`, async () => {
    test.setTimeout(120_000);
    await setMode(a.access_token, dmId, mode);
    await alice.page.waitForTimeout(3_000);
    const name = `note-${stamp()}.txt`;
    await alice.page.locator('input[type="file"]').setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(`hello from ${mode}`) });
    await alice.page.getByRole("textbox", { name: /^Message / }).press("Enter");
    expect(await sees(bob.page, name, 40_000), `${mode}: bob sees attachment ${name}`).toBe(true);
    expect(await sees(alice.page, name, 10_000), `${mode}: alice sees her own attachment`).toBe(true);
  });

  test(`${mode}: attachment content is actually readable by the peer`, async () => {
    test.setTimeout(120_000);
    // Standard files download from a signed, expiring CDN URL; Ephemeral recipients ask the server for one.
    // P2P streams the bytes over the data channel.
    await setMode(a.access_token, dmId, mode);
    await alice.page.waitForTimeout(3_000);
    const name = `body-${stamp()}.png`;
    const imagesBefore = await bob.page.locator("img.media-tile-media").count();
    // 1x1 PNG: an image proves the bytes arrived intact (the CSP forbids fetching blob: URLs from the page).
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
    await alice.page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer: png });
    await alice.page.getByRole("textbox", { name: /^Message / }).press("Enter");
    // The image is not labelled with the file name in the DOM, and earlier tests leave their images in the
    // chat: the one just sent is the newest.
    await expect(bob.page.locator("img.media-tile-media")).toHaveCount(imagesBefore + 1, { timeout: 40_000 });
    const image = bob.page.locator("img.media-tile-media").last();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBe(1);
    if (mode !== "standard") expect(await image.getAttribute("src")).toMatch(/^blob:/);
    else expect(await image.getAttribute("src")).toMatch(/\/attachments\/\d+\/\d+\/body-.*\.png\?ex=[0-9a-f]+&is=[0-9a-f]+&hm=[0-9a-f]{64}$/);
  });

  test(`${mode}: edit, reaction and delete behave per mode`, async () => {
    test.setTimeout(120_000);
    await setMode(a.access_token, dmId, mode);
    await alice.page.waitForTimeout(3_000);
    const text = `feat ${mode} ${stamp()}`;
    await say(alice.page, text);
    expect(await sees(bob.page, text)).toBe(true);
    const mine = alice.page.locator(".message", { hasText: text }).first();
    await mine.hover();
    const toolbar = alice.page.getByRole("toolbar", { name: "Message actions" });
    await expect(toolbar.getByRole("button", { name: "Reply" })).toBeVisible();
    if (mode === "standard") {
      await toolbar.getByRole("button", { name: "Edit" }).click();
      const edited = `${text} edited`;
      const editor = alice.page.getByRole("textbox", { name: "Edit message" });
      await editor.fill(edited);
      await editor.press("Enter");
      expect(await sees(bob.page, edited), "bob sees the edit").toBe(true);

      const theirs = bob.page.locator(".message", { hasText: edited }).first();
      await theirs.hover();
      await bob.page.getByRole("toolbar", { name: "Message actions" }).getByRole("button", { name: "Add reaction" }).click();
      await bob.page.getByRole("dialog", { name: "Emoji picker" }).locator(".emoji-grid button").first().click();
      await expect(alice.page.locator(".message", { hasText: edited }).locator(".reaction").first()).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(toolbar.getByRole("button", { name: "Edit" })).toHaveCount(0);
      await expect(toolbar.getByRole("button", { name: "Add reaction" })).toHaveCount(0);
    }
    await mine.hover();
    await toolbar.getByRole("button", { name: "More" }).click();
    await alice.page.getByRole("menuitem", { name: "Delete message" }).click();
    await alice.page.getByRole("button", { name: "Delete", exact: true }).click();
    if (mode === "standard") {
      await expect(bob.page.getByText(text)).toHaveCount(0, { timeout: 20_000 });
    } else {
      await expect(alice.page.getByText(/cannot be deleted after sending/i).first()).toBeVisible({ timeout: 10_000 });
    }
  });
}
