// Matrix: member added to / removed from an Ephemeral guild channel (MLS epoch change). Group DMs have no
// "add member" API (members can only leave), so add/remove is exercised on a guild channel; the group DM
// leave case lives in matrix-group.spec.ts.
import { expect, test } from "@playwright/test";
import { close, dump, ensureUser, launch, rest, say, sees, stamp, type Instance } from "./matrix-helpers";

async function openGuildChannel(page: Instance["page"], guildName: string): Promise<void> {
  await page.getByRole("navigation", { name: "Servers" }).getByRole("button", { name: guildName }).click({ timeout: 30_000 });
  await page.locator(".channel-row", { hasText: "general" }).first().click({ timeout: 20_000 });
}

test("guild ephemeral channel: new member joins the MLS group and removed member loses access", async () => {
  test.setTimeout(480_000);
  const id = stamp();
  const a = await ensureUser(`mua${id}`);
  const b = await ensureUser(`mub${id}`);
  const c = await ensureUser(`muc${id}`);
  const guildName = `mx${id}`;
  const guild = await rest<{ id: string }>("POST", "/guilds", a.access_token, { name: guildName });
  const channels = await rest<{ id: string; name: string; type: number }[]>("GET", `/guilds/${guild.id}/channels`, a.access_token);
  const general = channels.find((ch) => ch.type === 0)!;
  const join = async (token: string) => {
    const invite = await rest<{ code: string }>("POST", `/channels/${general.id}/invites`, a.access_token, {});
    await rest("POST", `/invites/${invite.code}`, token);
  };
  await join(b.access_token);
  await rest("PATCH", `/channels/${general.id}`, a.access_token, { delivery_mode: "ephemeral" });

  const all: Instance[] = [];
  const result: Record<string, boolean> = {};
  try {
    const A = await launch("A", { user: a.user.username });
    const B = await launch("B", { user: b.user.username });
    all.push(A, B);
    await openGuildChannel(A.page, guildName);
    await openGuildChannel(B.page, guildName);
    const t1 = `guild before-join ${stamp()}`;
    await say(A.page, t1);
    result["A->B before C joins"] = await sees(B.page, t1);

    // C joins: next send adds C's device (commit to A/B, welcome to C)
    await join(c.access_token);
    const C = await launch("C", { user: c.user.username });
    all.push(C);
    await openGuildChannel(C.page, guildName);
    await A.page.waitForTimeout(3_000);
    const t2 = `guild after-join ${stamp()}`;
    await say(A.page, t2);
    result["A->B,C after C joins: B"] = await sees(B.page, t2);
    result["A->B,C after C joins: C"] = await sees(C.page, t2);
    result["C does not see history from before joining"] = !(await sees(C.page, t1, 4_000));
    const t3 = `guild from-C ${stamp()}`;
    await say(C.page, t3);
    result["C->A"] = await sees(A.page, t3);
    result["C->B"] = await sees(B.page, t3);

    // C is removed: the remaining devices commit a Remove; later messages are unreadable for C
    await rest("DELETE", `/guilds/${guild.id}/members/${c.user.id}`, a.access_token);
    await A.page.waitForTimeout(6_000);
    const before = [...A.ops, ...B.ops].filter((o) => o.dir === ">" && o.op === 20 && o.content_type === "commit").length;
    const t4 = `guild after-kick ${stamp()}`;
    await say(A.page, t4);
    result["after kick: B reads"] = await sees(B.page, t4);
    result["after kick: C cannot read"] = !(await sees(C.page, t4, 8_000));
    const after = [...A.ops, ...B.ops].filter((o) => o.dir === ">" && o.op === 20 && o.content_type === "commit").length;
    result["a Remove commit was relayed after the kick"] = after >= 1 && after >= before;
    console.log("RESULT " + JSON.stringify(result, null, 1));
  } finally {
    await dump("guild", ...all);
    await close(...all);
  }
  expect(Object.entries(result).filter(([, v]) => !v)).toEqual([]);
});
