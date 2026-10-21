// Matrix: recipient offline then online (inbox replay / expected P2P failure) and app restart behaviour.
import { expect, test } from "@playwright/test";
import { close, dump, ensureUser, launch, openDm, rest, say, sees, setMode, stamp, type Instance } from "./matrix-helpers";

test.describe.configure({ mode: "serial" });

test("offline recipient: standard + ephemeral replay on reconnect, p2p fails honestly; restart keeps what it should", async () => {
  test.setTimeout(420_000);
  const id = stamp();
  const a = await ensureUser(`mxa${id}`);
  const b = await ensureUser(`mxb${id}`);
  const dm = await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id] });
  let alice: Instance | undefined;
  let bob: Instance | undefined;
  const result: Record<string, unknown> = {};
  try {
    alice = await launch("alice", { user: a.user.username });
    bob = await launch("bob", { user: b.user.username });
    // Bob must have registered a device and published key packages; then he goes offline.
    const bobDir = bob.dataDir;
    await close(bob);
    bob = undefined;
    await openDm(alice.page, b.user.username);

    for (const mode of ["standard", "ephemeral"] as const) {
      await setMode(a.access_token, dm.id, mode);
      await alice.page.waitForTimeout(2_000);
      const text = `offline ${mode} ${stamp()}`;
      await say(alice.page, text);
      expect(await sees(alice.page, text, 20_000), `${mode}: alice sees own message`).toBe(true);
      bob = await launch("bob", { user: b.user.username, dataDir: bobDir, resume: true });
      await openDm(bob.page, a.user.username);
      result[`${mode}-replayed`] = await sees(bob.page, text, 30_000);
      if (mode === "ephemeral") {
        await bob.page.waitForTimeout(2_000);
        result["ephemeral-acked"] = bob.ops.some((o) => o.dir === ">" && o.op === 21 && o.ids.length > 0);
      }
      // restart bob: history must still be there (standard from server, ephemeral from the encrypted local store)
      await close(bob);
      bob = await launch("bob", { user: b.user.username, dataDir: bobDir, resume: true });
      await openDm(bob.page, a.user.username);
      result[`${mode}-after-restart`] = await sees(bob.page, text, 20_000);
      await close(bob);
      bob = undefined;
    }

    // P2P with the peer offline: sending must fail loudly and nothing may be stored.
    await setMode(a.access_token, dm.id, "p2p");
    await alice.page.waitForTimeout(2_000);
    const p2pText = `offline p2p ${stamp()}`;
    await say(alice.page, p2pText);
    result["p2p-offline-message"] = await alice.page
      .getByText(/Peer offline|could not|failed/i)
      .first()
      .waitFor({ timeout: 40_000 })
      .then(() => true)
      .catch(() => false);
    bob = await launch("bob", { user: b.user.username, dataDir: bobDir, resume: true });
    await openDm(bob.page, a.user.username);
    result["p2p-not-delivered-later"] = !(await sees(bob.page, p2pText, 6_000));
    console.log("RESULT " + JSON.stringify(result, null, 1));
  } finally {
    if (alice && bob) await dump("offline", alice, bob);
    else if (alice) await dump("offline", alice);
    await setMode(a.access_token, dm.id, null).catch(() => undefined);
    await close(alice, bob);
  }
  expect(result).toEqual({
    "standard-replayed": true,
    "standard-after-restart": true,
    "ephemeral-replayed": true,
    "ephemeral-acked": true,
    "ephemeral-after-restart": true,
    "p2p-offline-message": true,
    "p2p-not-delivered-later": true,
  });
});
