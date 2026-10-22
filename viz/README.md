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

Page: *The array, step by step* (play / pause / step / scrub / speed 0.5x-4x, plain-language caption
per phase, W / A / C matrices, "matches the reference" badge, "Try your own numbers") and
*Same array: CNN and LSTM* (im2col patches and an LSTM step executed on the same RTL).

## Rebuild

Needs: Verilator >= 5, Emscripten (`emcc`/`em++`), Node >= 18, pnpm (tested: Verilator 5.032,
emscripten 3.1.69, Node 20, pnpm 12 on Debian 13).

```
cd viz
bash wasm/build.sh 4          # verilate + native self-check + emcc -> web/public/npu_viz.{mjs,wasm}
cd web && pnpm install && pnpm build      # -> web/dist  (static site)
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
* `tests/ui_check.mjs`: headless Chromium (playwright-core): steps through the page, checks the badge
  for the default and for user-entered random matrices, no console errors, saves a mid-animation
  screenshot.

Third-party attribution (tiny-tpu, MIT): see `THIRD_PARTY.md`, `LICENSE.tiny-tpu`.
