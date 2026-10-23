// Headless check of the 3D tab (software WebGL):
//   (cd web/dist && python3 -m http.server 8110 &) ; node tests/ui3d_check.mjs [outdir] [baseurl]
// - the 2D tab still works (badge pending -> true after stepping to the end)
// - the 3D tab opens from the tab button, the canvas is not blank (pixel statistics of screenshots)
// - the clock/caption advance with the trace, the final badge says "matches" (RTL result == A x W)
// - no console / page errors
import { chromium } from "playwright-core";
// GPU=1 -> use the real GPU (Windows/desktop); default = software WebGL (SwiftShader), e.g. in a headless container
const GL_ARGS = ["--no-sandbox", ...(process.env.GPU === "1" ? ["--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])];
import { PNG } from "pngjs";
const out = process.argv[2] ?? ".";
const base = process.argv[3] ?? "http://localhost:8110/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true,
  args: GL_ARGS,
});
let ok = true; const expect = (c, m) => { if (!c) { ok = false; console.log("FAIL", m); } else console.log("ok  ", m); };
const errs = [];

// ---- 2D tab unchanged
{
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(base, { waitUntil: "networkidle" });
  await p.waitForSelector("svg");
  expect((await p.getAttribute("[data-testid=match-badge]", "data-match")) === "pending", "2D: badge pending at cycle 0");
  for (let i = 0; i < 30; i++) { const nx = p.locator('button[aria-label="Step forward"]'); if (await nx.isDisabled()) break; await nx.click(); }
  expect((await p.getAttribute("[data-testid=match-badge]", "data-match")) === "true", "2D: badge true at the end");
  // ---- open the 3D tab with the tab button
  await p.click('button[role=tab]:has-text("3D view")');
  await p.waitForFunction(() => window.__viz3d?.ready, null, { timeout: 60000 });
  expect(await p.locator("canvas.v3d-canvas").count() === 1, "3D: canvas present");
  await p.evaluate(() => __viz3d.frame(0));
  expect((await p.innerText("[data-testid=cycle-counter]")).includes("00"), "3D: cycle counter shows 00 at start");
  expect((await p.getAttribute("[data-testid=match-badge-3d]", "data-match")) === "pending", "3D: badge pending at start");
  await p.close();
}

// ---- 3D frames: not blank, differ from each other, counter + badge follow the trace
const stats = (buf) => {
  const png = PNG.sync.read(buf); let sum = 0, bright = 0; const set = new Set();
  for (let i = 0; i < png.data.length; i += 4 * 97) {
    const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; sum += l; if (l > 90) bright++;
    set.add((png.data[i] >> 4) * 256 + (png.data[i + 1] >> 4) * 16 + (png.data[i + 2] >> 4));
  }
  return { mean: sum / (png.data.length / 4 / 97), bright, colours: set.size };
};
{
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(`${base}?capture=1#3d`, { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__viz3d?.ready, null, { timeout: 60000 });
  const shots = [];
  for (const tf of [0, 6, 9, 12, 17]) {
    await p.evaluate((t) => __viz3d.frame(t), tf);
    const buf = await p.screenshot({ path: `${out}/ui3d_${tf}.png` });
    const s = stats(buf); shots.push(s);
    console.log(`tf=${tf}`, JSON.stringify(s), "counter:", (await p.innerText("[data-testid=cycle-counter]")).replace(/\s+/g, " "));
    expect(s.colours > 40 && s.mean > 8, `3D frame tf=${tf} is not blank (colours ${s.colours}, mean luminance ${s.mean.toFixed(1)})`);
  }
  expect(shots[2].bright > shots[0].bright, "3D: more lit pixels mid-run than before the run");
  const tEnd = await p.evaluate(() => __viz3d.tEnd);
  await p.evaluate((t) => __viz3d.frame(t), tEnd);
  expect((await p.getAttribute("[data-testid=match-badge-3d]", "data-match")) === "true", "3D: final badge = RTL result matches A x W");
  expect((await p.innerText("[data-testid=caption-3d]")).includes("matches"), "3D: final caption");
  console.log("renderer info", JSON.stringify(await p.evaluate(() => __viz3d.info())));
  await p.close();
}
// ---- user-entered numbers (6 rows of A, random) are run through the RTL and shown in 3D as well
{
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(base, { waitUntil: "networkidle" });
  await p.waitForSelector("svg");
  await p.click("summary"); await p.selectOption("select", "6");
  await p.click("text=Random numbers"); await p.click("text=Run on the RTL");
  await p.waitForTimeout(600); await p.click('button[aria-label="Pause"]').catch(() => {});
  await p.click('button[role=tab]:has-text("3D view")');
  await p.waitForFunction(() => window.__viz3d?.ready, null, { timeout: 60000 });
  await p.evaluate(() => __viz3d.frame(__viz3d.tEnd));
  expect((await p.getAttribute("[data-testid=match-badge-3d]", "data-match")) === "true", "3D: random 6x4 matrices: final badge = matches");
  const buf = await p.screenshot({ path: `${out}/ui3d_random6.png` });
  expect(stats(buf).colours > 40, "3D: random 6x4 frame is not blank");
  await p.close();
}
expect(errs.length === 0, "no console/page errors " + errs.join("|"));
await b.close();
console.log(ok ? "UI3D CHECK PASSED" : "UI3D CHECK FAILED"); process.exit(ok ? 0 : 1);
