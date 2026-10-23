// Deterministic offline renderer for the 3D view video (software WebGL is slow, so frames are rendered one by one
// from a script: the page is in ?capture=1 mode, and window.__viz3d.frame(tf) sets the cycle clock; nothing depends on real time).
//   (cd web/dist && python3 -m http.server 8110 &)
//   node tests/render3d_video.mjs <frames_dir> <worker_index> <num_workers> [baseurl]
//   ffmpeg -framerate 30 -i <frames_dir>/%05d.jpg -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -movflags +faststart out.mp4
// Several workers (processes) may render interleaved frames in parallel; already existing frames are skipped (resumable).
import { chromium } from "playwright-core";
// GPU=1 -> use the real GPU (Windows/desktop); default = software WebGL (SwiftShader), e.g. in a headless container
const GL_ARGS = ["--no-sandbox", ...(process.env.GPU === "1" ? ["--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])];
import { mkdirSync, existsSync } from "node:fs";
const dir = process.argv[2] ?? "frames";
const worker = Number(process.argv[3] ?? 0), workers = Number(process.argv[4] ?? 1);
const base = process.argv[5] ?? "http://localhost:8110/";
const FPS = 30;
mkdirSync(dir, { recursive: true });

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true,
  args: GL_ARGS,
});
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await p.goto(`${base}?capture=1&present=1&cine=1#3d`, { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__viz3d?.ready, null, { timeout: 60000 });
const { tEnd, tGreen } = await p.evaluate(() => ({ tEnd: __viz3d.tEnd, tGreen: __viz3d.tGreen }));

// keyframes: [time in seconds, cycle clock]; linear in between.
//  0-5 s   establishing shot (camera orbits the empty array, clock -3 -> 0)
//  5-15 s  weights load (4 cycles, 2.6 s each)
//  15-57 s feed / multiply-add / results (3.6 s per cycle)
//  ...     last results -> bars -> green badge (3.2 s per cycle), then 8 s outro orbit around the finished result
const t1 = 5, t2 = t1 + 4 * 2.6, t3 = t2 + (tGreen - 4) * 3.6, t4 = t3 + (tEnd - tGreen) * 3.2, t5 = t4 + 8;
const KEYS = [[0, -3], [t1, 0], [t2, 4], [t3, tGreen], [t4, tEnd], [t5, tEnd + 4]];
const tfAt = (T) => {
  for (let i = 0; i + 1 < KEYS.length; i++) if (T <= KEYS[i + 1][0]) {
    const [a, x] = KEYS[i], [c, y] = KEYS[i + 1]; return x + ((y - x) * (T - a)) / (c - a);
  }
  return KEYS[KEYS.length - 1][1];
};
const total = Math.round(t5 * FPS);
if (worker === 0) console.log(`total frames ${total} (${(total / FPS).toFixed(1)} s), tEnd ${tEnd}, tGreen ${tGreen}`);
const t0 = Date.now(); let done = 0;
for (let f = worker; f < total; f += workers) {
  const path = `${dir}/${String(f).padStart(5, "0")}.jpg`;
  if (existsSync(path)) continue;
  await p.evaluate((tf) => __viz3d.frame(tf), tfAt(f / FPS));
  await p.screenshot({ path, type: "jpeg", quality: 95 });
  done++;
  if (done % 20 === 0) console.log(`worker ${worker}: frame ${f}/${total}, ${((Date.now() - t0) / done / 1000).toFixed(2)} s/frame`);
}
console.log(`worker ${worker} finished ${done} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await b.close();
