// Node check of the WASM build (dist/npu_viz.mjs): runs the demo example, asserts C == A x W,
// asserts per-cycle PE state invariants of sa_top, and (optionally) that the WASM trace is
// identical to the native Verilator trace:   node tests/node_check.mjs [native_dump.txt]
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const mod = await (await import(pathToFileURL(join(here, "..", "web", "dist", "npu_viz.mjs")).href)).default();
const sim = new mod.NpuSim();
const N = sim.getN();
let errs = 0;
const check = (c, msg) => { if (!c) { if (errs < 15) console.log("FAIL:", msg); errs++; } };

const W = [[1, 0, 2, -1], [3, 1, 0, 2], [-2, 4, 1, 0], [0, 1, -1, 3]];
const A = [[1, 2, 3, 4], [5, 6, 7, 8], [-1, 0, 1, 2], [2, -3, 4, -5]];
const gold = (A, W) => A.map((r) => W[0].map((_, j) => r.reduce((s, a, k) => s + a * W[k][j], 0)));

function verify(A, W, name) {
  const M = A.length;
  const r = sim.run(A.flat(), M, W.flat());
  const g = gold(A, W).flat();
  check(JSON.stringify([...r.result]) === JSON.stringify(g), `${name}: C != numpy-style A@W`);
  const S = r.states, s0 = N * N / 4;
  check(S.length === s0 + M - 1 + 2 * N - 1 + 1, `${name}: trace length ${S.length}`);
  for (const c of S) {
    const t = c.cycle;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = i * N + j;
      if (t >= s0) check(c.w[k] === W[i][j], `${name}: weight PE${i}${j} t${t}`);
      const m = t - s0 - i - j;
      check(c.a[k] === (m >= 0 && m < M ? A[m][i] : 0), `${name}: a PE${i}${j} t${t}`);
      const mp = t - 1 - s0 - i - j;
      let ps = 0; if (mp >= 0 && mp < M) for (let q = 0; q <= i; q++) ps += A[mp][q] * W[q][j];
      check(c.ps[k] === ps, `${name}: psum PE${i}${j} t${t}: ${c.ps[k]} vs ${ps}`);
    }
    const mo = t - s0 - (2 * N - 1);
    check(c.outValid === (mo >= 0 && mo < M), `${name}: out_valid t${t}`);
    if (c.outValid) check(JSON.stringify([...c.cOut]) === JSON.stringify(gold(A, W)[mo]), `${name}: c_out row ${mo}`);
  }
  console.log(`[${name}] M=${M} cycles=${S.length} -> ${errs ? "errors so far " + errs : "ok"}`);
  return r;
}

const r = verify(A, W, "demo 4x4");
console.log("C =", JSON.stringify(gold(A, W)), "(RTL equals reference)");
verify([[7, -3, 100, -128]], [[127, -128, 5, 0], [1, 2, 3, 4], [-5, 6, -7, 8], [9, 9, 9, 9]], "1 row extreme");
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256) - 128;
for (let q = 0; q < 6; q++) {
  const M = 1 + (q * 3) % 8;
  verify(Array.from({ length: M }, () => Array.from({ length: N }, rnd)), Array.from({ length: N }, () => Array.from({ length: N }, rnd)), `random ${q}`);
}

if (process.argv[2]) {
  const lines = readFileSync(process.argv[2], "utf8").trim().split("\n");
  const ph = { LOAD: 0, STREAM: 1, DRAIN: 2, DONE: 3 };
  const mine = r.states.map((c) => [c.cycle, ph[c.phase], +c.wWe, c.wIdx, +c.inValid, c.inRow, +c.outValid, c.outRow,
    ...c.aIn, ...c.aSkew, ...c.cOut, ...c.south, ...c.w, ...c.a, ...c.psIn, ...c.ps].join(" "));
  check(lines.length === mine.length, "native trace length differs");
  lines.forEach((l, i) => check(l.trim() === mine[i], `trace line ${i} differs from native Verilator`));
  console.log(`WASM trace identical to native Verilator trace: ${errs === 0} (${lines.length} cycles)`);
}
console.log(errs ? `NODE CHECK FAILED (${errs})` : "NODE CHECK PASSED");
process.exit(errs ? 1 : 0);
