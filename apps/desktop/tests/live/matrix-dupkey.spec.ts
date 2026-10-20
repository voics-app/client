// Regression (client#105): a user whose device re-registered on sign-in owns several device rows that
// share one identity (signature) key. Adding them all to an MLS group failed with
// CreateCommitError(ProposalValidationError(DuplicateSignatureKey)). Covers a guild channel and a DM.
import { expect, test } from "@playwright/test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { close, dump, ensureUser, launch, newDataDir, openDm, rest, say, sees, setMode, stamp, type Instance } from "./matrix-helpers";

/** Signs the same device in twice: a second sign-in registers a second device row with the same identity key. */
async function reRegisteredDevice(name: string, user: string): Promise<Instance> {
  const dataDir = newDataDir();
  const first = await launch(`${name}-first`, { user, dataDir });
  await first.page.waitForTimeout(4_000);
  await close(first);
  rmSync(join(dataDir, "session.bin"), { force: true });
  return launch(name, { user, dataDir });
}

test("ephemeral send works when a member owns several device rows with one identity key", async () => {
  test.setTimeout(420_000);
  const id = stamp();
  const a = await ensureUser(`dka${id}`);
  const b = await ensureUser(`dkb${id}`);
  const guildName = `dk${id}`;
  const guild = await rest<{ id: string }>("POST", "/guilds", a.access_token, { name: guildName });
  const channels = await rest<{ id: string; type: number }[]>("GET", `/guilds/${guild.id}/channels`, a.access_token);
  const general = channels.find((ch) => ch.type === 0)!;
  const invite = await rest<{ code: string }>("POST", `/channels/${general.id}/invites`, a.access_token, {});
  await rest("POST", `/invites/${invite.code}`, b.access_token);
  await rest("PATCH", `/channels/${general.id}`, a.access_token, { delivery_mode: "ephemeral" });
  const dm = await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id] });
  await setMode(a.access_token, dm.id, "ephemeral");

  const all: Instance[] = [];
  const result: Record<string, boolean> = {};
  try {
    const B = await reRegisteredDevice("B", b.user.username);
    const A = await launch("A", { user: a.user.username });
    all.push(B, A);
    const devices = await rest<{ identity_key_b64: string }[]>("GET", `/users/${b.user.id}/devices`, a.access_token);
    expect(new Set(devices.map((d) => d.identity_key_b64)).size).toBeLessThan(devices.length);

    await openDm(A.page, b.user.username);
    await openDm(B.page, a.user.username);
    const t1 = `dup dm ${stamp()}`;
    await say(A.page, t1);
    result["dm A->B"] = await sees(B.page, t1);

    for (const p of [A.page, B.page]) {
      await p.getByRole("navigation", { name: "Servers" }).getByRole("button", { name: guildName }).click({ timeout: 30_000 });
      await p.locator(".channel-row", { hasText: "general" }).first().click({ timeout: 20_000 });
    }
    const t2 = `dup guild ${stamp()}`;
    await say(A.page, t2);
    result["guild A->B"] = await sees(B.page, t2);
    const t3 = `dup guild back ${stamp()}`;
    await say(B.page, t3);
    result["guild B->A"] = await sees(A.page, t3);
    console.log("RESULT " + JSON.stringify(result));
  } finally {
    await dump("dupkey", ...all);
    await setMode(a.access_token, dm.id, null).catch(() => undefined);
    await close(...all);
  }
  expect(all.flatMap((i) => i.log).join("\n")).not.toContain("DuplicateSignatureKey");
  expect(result).toEqual({ "dm A->B": true, "guild A->B": true, "guild B->A": true });
});
