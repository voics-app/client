// Matrix: group DM of three (MLS group add, P2P mesh), member leaving (epoch change), new device after the group exists.
import { expect, test } from "@playwright/test";
import { close, dump, ensureUser, launch, openDm, rest, say, sees, setMode, stamp, type Instance } from "./matrix-helpers";

test("group DM of 3: all modes deliver; a member who leaves cannot read later messages; a new device joins via welcome", async () => {
  test.setTimeout(540_000);
  const id = stamp();
  const a = await ensureUser(`mga${id}`);
  const b = await ensureUser(`mgb${id}`);
  const c = await ensureUser(`mgc${id}`);
  const group = await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id, c.user.id] });
  const all: Instance[] = [];
  const result: Record<string, boolean> = {};
  try {
    const A = await launch("A", { user: a.user.username });
    const B = await launch("B", { user: b.user.username });
    const C = await launch("C", { user: c.user.username });
    all.push(A, B, C);
    // The group row is titled after its members; any peer's name finds it.
    await openDm(A.page, b.user.username);
    await openDm(B.page, a.user.username);
    await openDm(C.page, a.user.username);

    for (const mode of ["standard", "ephemeral", "p2p"] as const) {
      await setMode(a.access_token, group.id, mode);
      await A.page.waitForTimeout(3_000);
      const t1 = `grp ${mode} A ${stamp()}`;
      await say(A.page, t1);
      const [b1, c1] = await Promise.all([sees(B.page, t1), sees(C.page, t1)]);
      result[`${mode}:A->B`] = b1;
      result[`${mode}:A->C`] = c1;
      const t2 = `grp ${mode} C ${stamp()}`;
      await say(C.page, t2);
      const [a2, b2] = await Promise.all([sees(A.page, t2), sees(B.page, t2)]);
      result[`${mode}:C->A`] = a2;
      result[`${mode}:C->B`] = b2;
    }

    // New device of B after the ephemeral group exists: gets a welcome on the next send, sees only later messages.
    await setMode(a.access_token, group.id, "ephemeral");
    const B2 = await launch("B2", { user: b.user.username });
    all.push(B2);
    await openDm(B2.page, a.user.username);
    const t3 = `grp new-device ${stamp()}`;
    await say(A.page, t3);
    result["ephemeral:new-device-B2"] = await sees(B2.page, t3);
    result["ephemeral:new-device-B1"] = await sees(B.page, t3);
    result["ephemeral:new-device-C"] = await sees(C.page, t3);

    // C leaves the group: later messages must not reach C. The remaining devices commit the removal.
    await rest("DELETE", `/channels/${group.id}`, c.access_token);
    await A.page.waitForTimeout(4_000);
    const t4 = `grp after-leave ${stamp()}`;
    await say(A.page, t4);
    result["ephemeral:after-leave-B"] = await sees(B.page, t4);
    result["ephemeral:after-leave-B2"] = await sees(B2.page, t4);
    result["ephemeral:after-leave-C-cannot-read"] = !(await sees(C.page, t4, 8_000));
    result["ephemeral:remove-commit-relayed"] = [...A.ops, ...B.ops, ...B2.ops].some((o) => o.dir === ">" && o.op === 20 && o.content_type === "commit" && (o.epoch ?? 0) > 1);
    console.log("RESULT " + JSON.stringify(result, null, 1));
  } finally {
    await dump("group", ...all);
    await setMode(a.access_token, group.id, null).catch(() => undefined);
    await close(...all);
  }
  expect(Object.entries(result).filter(([, v]) => !v)).toEqual([]);
});
