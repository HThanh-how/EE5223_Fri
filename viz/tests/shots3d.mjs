// Screenshots of the 3D view (1920x1080) at chosen cycles / camera poses, using software WebGL.
//   (cd web/dist && python3 -m http.server 8110 &)
//   node tests/shots3d.mjs <outdir> [baseurl]
// Frames are driven by window.__viz3d.frame(tf) (deterministic cycle clock), not by real time.
import { chromium } from "playwright-core";
// GPU=1 -> use the real GPU (Windows/desktop); default = software WebGL (SwiftShader), e.g. in a headless container
const GL_ARGS = ["--no-sandbox", ...(process.env.GPU === "1" ? ["--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])];
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? ".";
const base = process.argv[3] ?? "http://localhost:8110/";
mkdirSync(out, { recursive: true });

// name, tf (cycle clock), mode: pose name | "cine", present (hide the control bar)
const SHOTS = [
  ["01_array_empty_before_weights", 0.0, "iso", false],
  ["02_weights_loading", 2.4, "iso", false],
  ["03_weights_loaded_close", 4.0, "close", false],
  ["04_skewed_entry_iso", 5.6, "iso", false],
  ["05_wavefront_cinematic", 6.8, "cine", true],
  ["06_mid_wavefront_low_angle", 8.4, "low", false],
  ["07_partial_sums_side_view", 9.3, "side", false],
  ["08_partial_sums_top_view", 9.8, "top", false],
  ["09_results_emerging_iso", 11.5, "iso", false],
  ["10_results_to_chart_cinematic", 12.6, "cine", true],
  ["11_last_row_out", 14.2, "iso", false],
  ["12_final_badge_iso", 16.8, "iso", false],
  ["13_final_badge_cinematic", 17.6, "cine", true],
  ["14_wavefront_close", 7.4, "close", true],
];

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true,
  args: GL_ARGS,
});
const errs = [];
for (const [name, tf, mode, present] of SHOTS) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(`${base}?capture=1${present ? "&present=1" : ""}#3d`, { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__viz3d?.ready, null, { timeout: 60000 });
  await p.evaluate(([tf, mode]) => {
    if (mode === "cine") __viz3d.setCinematic(true); else __viz3d.setPose(mode);
    __viz3d.frame(tf);
  }, [tf, mode]);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log("saved", name);
  await p.close();
}
console.log(errs.length ? "ERRORS: " + errs.join(" | ") : "no console errors");
await b.close();
