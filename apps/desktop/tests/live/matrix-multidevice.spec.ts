// Matrix: recipient with two devices (both receive) and the sender's other device (sees its own message).
import { expect, test } from "@playwright/test";
import { close, dump, ensureUser, launch, openDm, rest, say, sees, setMode, stamp, type Instance } from "./matrix-helpers";

test("multi-device: every device of the recipient receives; sender's other device mirrors (standard, ephemeral)", async () => {
  test.setTimeout(420_000);
  const id = stamp();
  const a = await ensureUser(`mda${id}`);
  const b = await ensureUser(`mdb${id}`);
  const dm = await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id] });
  const all: Instance[] = [];
  const result: Record<string, boolean> = {};
  try {
    const a1 = await launch("a1", { user: a.user.username });
    const a2 = await launch("a2", { user: a.user.username });
    const b1 = await launch("b1", { user: b.user.username });
    const b2 = await launch("b2", { user: b.user.username });
    all.push(a1, a2, b1, b2);
    await openDm(a1.page, b.user.username);
    await openDm(a2.page, b.user.username);
    await openDm(b1.page, a.user.username);
    await openDm(b2.page, a.user.username);
    for (const mode of ["standard", "ephemeral", "p2p"] as const) {
      await setMode(a.access_token, dm.id, mode);
      await a1.page.waitForTimeout(3_000);
      const text = `md ${mode} ${stamp()}`;
      await say(a1.page, text);
      const [r1, r2, own] = await Promise.all([sees(b1.page, text), sees(b2.page, text), sees(a2.page, text, mode === "p2p" ? 8_000 : 30_000)]);
      result[`${mode}:b1`] = r1;
      result[`${mode}:b2`] = r2;
      result[`${mode}:a2-mirror`] = own;
      // and back: bob's second device answers; alice's both devices see it
      const reply = `md reply ${mode} ${stamp()}`;
      await say(b2.page, reply);
      const [ra1, ra2, rb1] = await Promise.all([sees(a1.page, reply), sees(a2.page, reply), sees(b1.page, reply, mode === "p2p" ? 8_000 : 30_000)]);
      result[`${mode}:reply->a1`] = ra1;
      result[`${mode}:reply->a2`] = ra2;
      result[`${mode}:reply-b1-mirror`] = rb1;
    }
    console.log("RESULT " + JSON.stringify(result, null, 1));
  } finally {
    await dump("multidevice", ...all);
    await setMode(a.access_token, dm.id, null).catch(() => undefined);
    await close(...all);
  }
  // p2p mirrors to the sender's own other devices are not part of the design (nothing is stored or relayed)
  const expected = Object.fromEntries(Object.keys(result).map((k) => [k, !/^p2p:(a2-mirror|reply-b1-mirror)$/.test(k)]));
  expect(result).toEqual(expected);
});
