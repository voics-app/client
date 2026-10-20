// Matrix: switching modes back and forth in one conversation, history after an app restart per mode,
// and inbox clean-up (an acknowledged ephemeral entry is never replayed).
import { expect, test } from "@playwright/test";
import { close, dump, ensureUser, launch, openDm, rest, say, sees, setMode, stamp, type Instance, type Mode } from "./matrix-helpers";

async function texts(page: Instance["page"]): Promise<string[]> {
  return page.locator(".message").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText));
}

test("modes switch back and forth; history after restart: standard from server, ephemeral and p2p from the encrypted local store", async () => {
  test.setTimeout(480_000);
  const id = stamp();
  const a = await ensureUser(`msa${id}`);
  const b = await ensureUser(`msb${id}`);
  const dm = await rest<{ id: string }>("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id] });
  let alice = await launch("alice", { user: a.user.username });
  let bob = await launch("bob", { user: b.user.username });
  const result: Record<string, unknown> = {};
  const sent: { mode: Mode; text: string }[] = [];
  try {
    await openDm(alice.page, b.user.username);
    await openDm(bob.page, a.user.username);
    const plan: Mode[] = ["standard", "ephemeral", "standard", "p2p", "ephemeral", "standard", "p2p"];
    for (const [i, mode] of plan.entries()) {
      await setMode(a.access_token, dm.id, mode);
      await alice.page.waitForTimeout(2_500);
      const text = `sw${i} ${mode} ${stamp()}`;
      await say(alice.page, text);
      sent.push({ mode, text });
      result[`${i}:${mode}:bob-sees`] = await sees(bob.page, text);
      // and bob answers in the same mode
      const reply = `sw${i} reply ${mode} ${stamp()}`;
      await say(bob.page, reply);
      sent.push({ mode, text: reply });
      result[`${i}:${mode}:alice-sees-reply`] = await sees(alice.page, reply);
    }
    // timeline order on both sides matches the send order
    const order = async (page: Instance["page"]) => (await texts(page)).map((t) => sent.findIndex((m) => t.includes(m.text))).filter((n) => n >= 0);
    const asc = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! < x);
    result["order:alice"] = asc(await order(alice.page));
    result["order:bob"] = asc(await order(bob.page));

    // restart both devices; the conversation keeps showing what each mode promises
    await setMode(a.access_token, dm.id, "standard");
    const [ad, bd] = [alice.dataDir, bob.dataDir];
    await close(alice, bob);
    alice = await launch("alice", { user: a.user.username, dataDir: ad, resume: true });
    bob = await launch("bob", { user: b.user.username, dataDir: bd, resume: true });
    await openDm(alice.page, b.user.username);
    await openDm(bob.page, a.user.username);
    await alice.page.waitForTimeout(2_000);
    for (const m of sent) {
      const here = await Promise.all([sees(alice.page, m.text, 6_000), sees(bob.page, m.text, 6_000)]);
      result[`restart:${m.mode}:${m.text.slice(0, 8)}`] = here[0] && here[1];
    }
    // no replay of acknowledged ephemeral entries after the restart
    result["no-op20-replay-after-restart"] = ![...alice.ops, ...bob.ops].some((o) => o.dir === "<" && o.op === 20);
    console.log("RESULT " + JSON.stringify(result, null, 1));
  } finally {
    await dump("switching", alice, bob);
    await setMode(a.access_token, dm.id, null).catch(() => undefined);
    await close(alice, bob);
  }
  expect(Object.entries(result).filter(([, v]) => v !== true)).toEqual([]);
});
