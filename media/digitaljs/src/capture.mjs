import { chromium } from 'playwright-core';
import fs from 'fs';
const OUT = '/root/work_dj/out';
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['screenshots', 'frames']) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const caps = [];
const settle = (ms = 450) => p.waitForTimeout(ms);
async function open(c) { await p.goto(`http://localhost:8123/?c=${c}`); await p.evaluate(() => window.simReady); await settle(1200); }
async function cap() { return p.evaluate(() => ({ title: document.getElementById('capTitle').textContent, text: document.getElementById('capBody').innerText.replace(/\s+/g, ' ').trim() })); }
async function shot(name, circuit) {
  const f = `${OUT}/screenshots/${name}.png`;
  await p.screenshot({ path: f });
  caps.push({ file: `${name}.png`, circuit, ...(await cap()) });
}
const half = async () => { const r = await p.evaluate(() => window.sim.stepHalf()); await settle(); return r; };
const halves = async (n) => { for (let i = 0; i < n; i++) await half(); };
async function card(html) {
  await p.evaluate((h) => {
    let d = document.getElementById('ovl'); if (!d) { d = document.createElement('div'); d.id = 'ovl'; document.body.appendChild(d); }
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:radial-gradient(circle at 30% 20%,#17233f,#0b1224);color:#e8eefc;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Arial;text-align:center;padding:60px';
    d.innerHTML = h;
  }, html);
  await settle(250);
}
const clearCard = () => p.evaluate(() => { const d = document.getElementById('ovl'); if (d) d.remove(); });
// ---- video segment recorder ----
const segs = []; let fi = 0;
async function frame(sec) { const f = `${OUT}/frames/f${String(fi++).padStart(4, '0')}.png`; await p.screenshot({ path: f }); segs.push([f, sec]); }
const H = (t, s = '') => `<div style="font-size:64px;font-weight:800;max-width:1500px;line-height:1.15">${t}</div><div style="font-size:30px;color:#9fb2d1;margin-top:28px;max-width:1400px;line-height:1.4">${s}</div>`;

// ======== SCREENSHOTS ========
await open('pe');
await shot('01_pe_static_layout', 'pe');
await half(); await shot('02_pe_inputs_applied_mid_computation', 'pe');
await half(); await shot('03_pe_after_first_clock_edge', 'pe');
await halves(2); await shot('04_pe_second_cycle_chained_sum', 'pe');
await halves(3); await shot('05_pe_waveform_all_cycles', 'pe');
await open('sa2');
await shot('06_sa2_static_layout', 'sa2');
await half(); await shot('07_sa2_cycle0_row0_enters', 'sa2');
await half(); await shot('08_sa2_cycle0_clock_edge', 'sa2');
await halves(2); await shot('09_sa2_cycle1_two_cells_active', 'sa2');
await halves(2); await shot('10_sa2_cycle2_wavefront', 'sa2');
await halves(2); await shot('11_sa2_cycle3_first_result_emerging', 'sa2');
await halves(2); await shot('12_sa2_cycle4_second_result', 'sa2');
await halves(10); await shot('13_sa2_final_matches_reference_and_waveform', 'sa2');
await p.evaluate(() => { window.sim.reset(); }); await settle();
await halves(5);
await p.evaluate(() => { window.sim.zoomBy(1.9); const w = document.getElementById('paperWrap'); w.scrollLeft = 520; w.scrollTop = 240; }); await settle(600);
await shot('14_sa2_zoomed_pe_internals', 'sa2');
await open('sa4');
await shot('15_sa4_static_layout', 'sa4');
await halves(9); await shot('16_sa4_cycle4_mid_computation', 'sa4');
await p.evaluate(() => { window.sim.zoomBy(2.2); const w = document.getElementById('paperWrap'); w.scrollLeft = 300; w.scrollTop = 250; }); await settle(600);
await shot('17_sa4_zoomed_active_cells', 'sa4');
await p.evaluate(() => window.sim.fit()); await settle(600);
await halves(12); await shot('18_sa4_final_matches_reference', 'sa4');
// custom numbers on 2x2 (user-editable inputs), compared with reference by the page
await open('sa2');
await p.evaluate(() => {
  const set = (id, v) => { document.getElementById(id).value = v; };
  [[-7, 3], [100, -128]].forEach((r, i) => r.forEach((v, j) => set(`W_${i}_${j}`, v)));
  const M = document.getElementById('Mrows'); M.value = 4; M.dispatchEvent(new Event('change'));
});
await p.evaluate(() => { [[127, -128], [-5, 9], [64, 64], [-1, -1]].forEach((r, m) => r.forEach((v, k) => { document.getElementById(`A_${m}_${k}`).value = v; })); document.getElementById('btnApply').click(); });
await settle();
for (let i = 0; i < 24; i++) { if (!(await half())) break; }
await shot('19_sa2_custom_int8_extreme_values_final', 'sa2');
const custom = await p.evaluate(() => ({ r: window.sim.results(), ref: window.sim.ref() }));
// ======== VIDEO ========
const codeCard = `<div style="font-size:46px;font-weight:800">Our PE (pe.sv): one multiply-accumulate cell</div>
<pre style="text-align:left;font-size:34px;line-height:1.45;background:#0b1325;border:1px solid #2b3b5e;border-radius:12px;padding:28px 40px;margin-top:30px;color:#e2e8f0">a_out    &lt;= a_in;                  // pass activation right
psum_out &lt;= psum_in + a_in * w;      // multiply, add, store</pre>
<div style="font-size:28px;color:#9fb2d1;margin-top:26px">Synthesised by Yosys into gates and rendered by DigitalJS</div>`;
await open('pe'); await card(H('From Verilog to circuits', 'An INT8 weight-stationary systolic array: the multiplier, adder and register wiring of our real NPU design, stepped clock by clock.<br><br>EE5223 project - DigitalJS circuit view')); await frame(4);
await card(codeCard); await frame(4.5);
await clearCard(); await settle(500);
await frame(3);
for (let i = 0; i < 6; i++) { await half(); await frame(1.8); }
await card(H('Now four cells: a 2x2 systolic array', 'Activations stream in from the left, partial sums trickle down. Same cell, repeated.')); await frame(2.5);
await open('sa2'); await frame(2.5);
for (let i = 0; i < 11; i++) { await half(); await frame(i === 10 ? 3.5 : 1.8); }
await card(H('Scaling up: 4x4 = 16 cells', 'Same design, bigger grid. Watch the diagonal wave and the result check.')); await frame(2.5);
await open('sa4'); await frame(2);
for (let i = 0; i < 21; i++) { await half(); await frame(i === 20 ? 4 : 0.7); }
await card(H('Result matches C = A x W', 'Verified for the 2x2 and 4x4 demos, in the browser, against a plain matrix product.<br>Circuit view: DigitalJS (BSD). Verilog: our pe.sv / sa_top.sv (plain-Verilog copy for the viewer).')); await frame(4);
fs.writeFileSync(`${OUT}/frames.txt`, segs.map(([f, d]) => `file '${f}'\nduration ${d}`).join('\n') + `\nfile '${segs[segs.length - 1][0]}'\n`);
fs.writeFileSync(`${OUT}/captions.json`, JSON.stringify(caps, null, 1));
fs.writeFileSync(`${OUT}/custom.json`, JSON.stringify(custom));
console.log('shots', caps.length, 'frames', segs.length, 'total sec', segs.reduce((s, x) => s + x[1], 0).toFixed(1), 'errors', errs.length, errs.slice(0, 3));
console.log('custom match', JSON.stringify(custom));
await b.close();
