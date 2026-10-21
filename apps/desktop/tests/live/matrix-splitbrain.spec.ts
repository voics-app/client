// client#118: Ephemeral must recover when a send happened before the peer had any device (a lone local MLS
// group is left behind) and when both sides send their very first message at the same time.
import { expect, test } from "@playwright/test";
import { close, dump, ensureUser, launch, openDm, rest, say, sees, setMode, stamp, type Instance } from "./matrix-helpers";

test("ephemeral: first send before the peer has a device, then the peer answers, then both race", async () => {
  test.setTimeout(420_000);
  const id = stamp();
  const a = await ensureUser(`sba${id}`);
  const b = await ensureUser(`sbb${id}`);
  const dm = await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id] });
  await setMode(a.access_token, dm.id, "ephemeral");
  const all: Instance[] = [];
  const result: Record<string, boolean> = {};
  try {
    const A = await launch("A", { user: a.user.username });
    all.push(A);
    await openDm(A.page, b.user.username);
    await say(A.page, `early ${id}`); // B has no device yet: nothing can be delivered
    await A.page.waitForTimeout(3_000);
    const B = await launch("B", { user: b.user.username });
    all.push(B);
    await openDm(B.page, a.user.username);
    const bFirst = `b-first ${stamp()}`;
    await say(B.page, bFirst);
    result["B->A first"] = await sees(A.page, bFirst, 40_000);
    const aReply = `a-reply ${stamp()}`;
    await say(A.page, aReply);
    result["A->B reply"] = await sees(B.page, aReply, 40_000);
    // race on a second, brand-new DM: both devices send their first message at once
    const c = await ensureUser(`sbc${id}`);
    const dm2 = await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [c.user.id] });
    await setMode(a.access_token, dm2.id, "ephemeral");
    const C = await launch("C", { user: c.user.username });
    all.push(C);
    await openDm(A.page, c.user.username);
    await openDm(C.page, a.user.username);
    const ta = `race-a ${stamp()}`;
    const tc = `race-c ${stamp()}`;
    await Promise.all([say(A.page, ta), say(C.page, tc)]);
    result["race A->C"] = await sees(C.page, ta, 40_000);
    result["race C->A"] = await sees(A.page, tc, 40_000);
    const after = `after-race ${stamp()}`;
    await say(A.page, after);
    result["after race A->C"] = await sees(C.page, after, 40_000);
    const back = `after-race-back ${stamp()}`;
    await say(C.page, back);
    result["after race C->A"] = await sees(A.page, back, 40_000);
    console.log("RESULT " + JSON.stringify(result, null, 1));
  } finally {
    await dump("splitbrain", ...all);
    await setMode(a.access_token, dm.id, null).catch(() => undefined);
    await close(...all);
  }
  expect(Object.values(result).every(Boolean), JSON.stringify(result)).toBe(true);
});
