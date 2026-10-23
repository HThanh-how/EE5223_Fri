# Live RTL demo: INT8 systolic-array NPU in the browser

A cycle-by-cycle animation of **our own `sa_top` (N=4)**. The numbers on the page are not
simulated in JavaScript: the project RTL (`../rtl/sa_top.sv`, `pe.sv`, `delay.sv`, untouched) is
verilated, compiled to WebAssembly, and every clock cycle of a real run is recorded and replayed.

```
rtl/sa_top.sv (unmodified) <- viz/rtl/viz_top.sv (observation wrapper, hierarchical refs)
        -> Verilator -> viz/wasm/viz_core.h (per-cycle recorder) -> Emscripten (npu_viz.wasm)
        -> Astro/React page (viz/web) : grid animation, captions, matrices, reference check
```

## Open it (offline, no internet needed)

```
cd viz/web/dist
python -m http.server 8000        # then browse to http://localhost:8000
```
(Must be served over http; opening `index.html` directly from disk will not load the WASM.)

### 3D view (new tab)

Open the page, click the **3D view** tab (or open `http://localhost:8000/#3d` directly). It is a full-screen Three.js
scene driven by the very same per-cycle trace of our `sa_top` (no extra data): the 4x4 PEs are blocks on a plate, block
**height = running total (partial sum)** held in the cell, colour = which row of A it belongs to, the **cyan gem + "w = x"
plate = stationary weight**, INT8 inputs are spheres moving left to right (the input skew triangle of delay boxes is on
the left), running totals are cubes moving down the columns, the output de-skew boxes and the result tray are below the
grid, and the results grow as bars of the matrix C on the right; at the end the bars turn green and a
"Matches the reference" badge appears (it is computed from the RTL result vs a plain A x W).
Controls: play / pause / step / scrubber / speed (0.25x-2x), **Cinematic camera** (slow orbit that follows the active
wavefront), Glow (bloom), Numbers, camera presets (iso / top / side / low / close); drag = orbit, wheel = zoom,
right-drag = pan. URL options: `?present=1` hides the control bar and tabs (for screen recording), `?bloom=0` disables the
glow pass, `?shadows=0`, `?pr=1` (pixel ratio), `?cine=1` (start with the cinematic camera). Three.js (MIT, exact version
0.180.0, see `web/package.json`) is bundled locally - no CDN, works offline. Source: `web/src/lib/scene3d.ts` (scene),
`web/src/components/View3D.tsx` (clock, captions, HUD), `web/src/styles/view3d.css`.
The 2D tabs are unchanged.

For videos the page has a deterministic mode (`?capture=1`): `window.__viz3d.frame(tf)` sets the cycle clock (fractional
cycles; the scene is a pure function of it), so frames can be rendered one by one even with slow software WebGL:
`tests/shots3d.mjs` (screenshots), `tests/render3d_video.mjs` (frames for the mp4), `tests/ui3d_check.mjs` (checks).

Page: *The array, step by step* (play / pause / step / scrub / speed 0.5x-4x, plain-language caption
per phase, W / A / C matrices, "matches the reference" badge, "Try your own numbers") and
*Same array: CNN and LSTM* (im2col patches and an LSTM step executed on the same RTL).

## Rebuild

Needs: Verilator >= 5, Emscripten (`emcc`/`em++`), Node >= 18, pnpm (tested: Verilator 5.032,
emscripten 3.1.69, Node 20, pnpm 12 on Debian 13).

```
cd viz
bash wasm/build.sh 4          # verilate + native self-check + emcc -> web/public/npu_viz.{mjs,wasm}
cd web && pnpm install && pnpm build      # -> web/dist  (static site; the 3D view is a separate lazily loaded chunk with Three.js)
node ../tests/node_check.mjs [native_trace.txt]   # headless check of the WASM (see Tests)
```
`NPU_RTL=<dir>` overrides the RTL location (default `../rtl`).

## Changing the matrices / N

* Matrices: use "Try your own numbers" on the page (W is 4x4, A has 1-8 rows, INT8 -128..127), or change
  `DEFAULT_A` / `DEFAULT_W` in `web/src/components/MatrixEditor.tsx`.
* N: `bash wasm/build.sh 8` builds N=8 (N must be a multiple of 4 and <= 8 because `a_in` is
  driven as one 64-bit word; weight words are written as in `sim/tb_sa.cpp`). The page adapts to
  `run.n`; the example matrices in `MatrixEditor.tsx` and the CNN/LSTM tab are 4x4-specific.

## How it works (files)

* `rtl/viz_top.sv` - instantiates `sa_top` and exposes per-PE weight / activation / partial sums,
  the skewed row inputs and the raw bottom-of-column sums by hierarchical reference
  (`u_sa.w`, `u_sa.a_bus`, `u_sa.ps_bus`). Nothing in `../rtl` is edited.
* `wasm/viz_core.h` - drives it like `sim/tb_sa.cpp` (load W: N*N/4 words; stream M rows; wait for
  `out_valid`), recording one snapshot per cycle (inputs applied, clock low, sample, then clock high).
* `wasm/bindings.cpp` - embind: `NpuSim.run(A, M, W) -> {n, m, states[], result[]}`.
* `web/src/lib/state-schema.ts` - the per-cycle contract (fields documented there).
* The delay boxes drawn left of / below the grid are the contents of the `delay` chains, derived
  from the recorded `a_in` / bottom-of-column history (they are verified equal to the real
  `a_bus[i][0]` and `c_out` values, which come straight from the RTL). The colour of a value (which
  row of A it belongs to) is derived from the fixed pipeline timing and is only used for colouring.

## Tests (all run on LXC 180, results in the hand-off report)

* `wasm/viz_native_test.cpp` (run by `build.sh`): native Verilator run, trace vs GEMM golden and vs
  structural invariants (stationary weights, activation at PE[i][j] = A[t-i-j][i], psum chaining,
  `out_valid` exactly 2N-1 cycles after the row entered).
* `tests/node_check.mjs`: same invariants on the WASM in Node + C == A x W for the demo, extreme and
  random cases; with a native trace dump it asserts WASM trace == native Verilator trace.
* `tests/ui3d_check.mjs`: headless Chromium with software WebGL: 2D tab still works, the 3D tab opens, frames are not
  blank, cycle counter / caption / final badge follow the trace, no console errors.
* `tests/ui_check.mjs`: headless Chromium (playwright-core): steps through the page, checks the badge
  for the default and for user-entered random matrices, no console errors, saves a mid-animation
  screenshot.

Third-party attribution (tiny-tpu, MIT): see `THIRD_PARTY.md`, `LICENSE.tiny-tpu`.
