// client#117: a shared video must play inline (readyState >= 2, currentTime advances) from the signed attachment URL.
import { expect, test } from "@playwright/test";
import { close, ensureUser, launch, openDm, rest, stamp, type Instance, type Session } from "./matrix-helpers";

test.describe.configure({ mode: "serial" });

let a: Session;
let b: Session;
let alice: Instance;
let bob: Instance;

/** Records a ~1.5 s canvas animation in the renderer; returns the bytes and the mime type the browser produced. */
async function recordClip(inst: Instance): Promise<{ bytes: number[]; mime: string }> {
  return inst.page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext("2d")!;
    const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m))!;
    const rec = new MediaRecorder(canvas.captureStream(25), { mimeType: mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        ctx.fillStyle = `hsl(${((performance.now() - t0) / 5) % 360},80%,50%)`;
        ctx.fillRect(0, 0, 160, 120);
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    rec.stop();
    await done;
    return { bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())), mime: mime.split(";")[0] };
  });
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const id = stamp();
  a = await ensureUser(`vda${id}`);
  b = await ensureUser(`vdb${id}`);
  await rest("POST", "/users/@me/channels", a.access_token, { recipient_ids: [b.user.id] });
  alice = await launch("alice", { user: a.user.username });
  bob = await launch("bob", { user: b.user.username });
  await openDm(alice.page, b.user.username);
  await openDm(bob.page, a.user.username);
});

test.afterAll(async () => {
  console.log(alice?.log.slice(-25).join("\n"));
  await close(alice, bob);
});

test("shared video plays inline for sender and recipient", async () => {
  test.setTimeout(150_000);
  const clip = await recordClip(alice);
  const ext = clip.mime === "video/mp4" ? "mp4" : "webm";
  await alice.page.locator('input[type="file"]').setInputFiles({ name: `clip-${stamp()}.${ext}`, mimeType: clip.mime, buffer: Buffer.from(clip.bytes) });
  await alice.page.getByRole("textbox", { name: /^Message / }).press("Enter");
  for (const who of [alice, bob]) {
    const video = who.page.locator("video.attachment-image").first();
    await expect(video, `${who.name}: <video> rendered`).toBeVisible({ timeout: 40_000 });
    const src = await video.evaluate((v: HTMLVideoElement) => v.currentSrc);
    const head = await who.page.evaluate(async (u) => {
      const r = await fetch(u, { headers: { Range: "bytes=0-99" } });
      return { status: r.status, type: r.headers.get("content-type"), range: r.headers.get("content-range") };
    }, src);
    console.log(`${who.name} ${src.slice(0, 120)} ->`, JSON.stringify(head));
    expect(head.status, `${who.name}: Range request`).toBe(206);
    await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => `${v.error?.code ?? ""}|${v.readyState}`), { timeout: 15_000, message: `${who.name}: readyState` }).toMatch(/^\|[234]$/);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000, message: `${who.name}: currentTime advances` }).toBeGreaterThan(0);
  }
});
