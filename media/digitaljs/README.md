# DigitalJS circuit-level simulation of the INT8 systolic NPU

Interactive 2D gate/register-level view of our Verilog (PE cell, 2x2 and 4x4 weight-stationary arrays), built with the
open-source **DigitalJS** (https://github.com/tilk/digitaljs) and **yosys2digitaljs**. Fully offline (no CDN).

## Open it
```
cd site
python -m http.server 8000      # then browse http://localhost:8000   (?c=pe | ?c=sa2 | ?c=sa4 selects the circuit)
```
Controls: Step (half step: apply inputs / clock edge), Step cycle, Run (speed slider), Reset, circuit selector,
editable weights W and activation rows A (INT8, "Apply and restart"), Zoom -/+/Fit. The right panel gives the plain-English
caption for each step; the bottom canvas is the waveform of key wires; the Result panel compares C against A x W (plain JS).

## What is real and what was simplified (please read)
* `circuits/pe.v` is a **plain-Verilog copy** of `rtl/pe.sv` (always_ff -> always, logic -> reg/wire, `32'(a*w)` -> signed-context
  sign extension). Same registers, same async active-low reset, INT8 x INT8 -> 16-bit product -> 32-bit sum. `proj/rtl` was not edited.
  The .sv files themselves were not fed to yosys2digitaljs.
* `circuits/sa2.v`, `sa4.v` are generated plain-Verilog tops that instantiate `pe` N*N times with the same skew (row i delayed i),
  de-skew (column j delayed N-1-j) and `out_valid` delay (2N-1) as `sa_top.sv`. Delays are chains of `delay1.v` (what `delay.sv` becomes for D=1).
  **Difference vs sa_top:** the weights are plain input ports (stationary, set from the page) instead of the `w_we/w_widx/w_wdata`
  write port + weight register file; the NPU bus wrapper `npu_avmm.sv` is not shown. Full 32-bit sums and INT8 inputs are kept (no width reduction).
* `*_flat.json`: yosys2digitaljs output (hierarchical `sa2.json`/`sa4.json` also kept) post-processed by `src/flatten.mjs`
  (inlines the `pe`/delay sub-circuits, readable labels, hand-placed grid layout so the array looks like a grid). `pe_nice.json`:
  labels/positions only (`src/pe_layout.mjs`). Logic is untouched. Yosys-inferred cells are shown as blocks (multiplier, adder, D registers), not as individual NAND/NOR gates.
* The clk/rst_n fan-out wires are hidden for readability (only the clock path to the valid-delay chain stays visible).
* The waveform panel is a small custom canvas (sampled once per half step), not DigitalJS's own monitor widget.
* 4x4 (16 PEs, 115 cells) renders and simulates correctly but the whole circuit is small at 1920x1080; use Zoom (see screenshot 17).
* Demo data: W/A for 4x4 are the same matrices as `viz/README`; the 2x2 uses the top-left 2x2 of W with A = [[1,2],[5,6],[-1,0]].

## Verification (headless Chromium via Playwright, on LXC 180)
Result read from the simulated circuit's `c` outputs whenever `out_valid=1`, compared with A x W:
* 2x2: C = [[7,2],[23,6],[-1,0]] equals reference.
* 4x4: C = [[1,18,1,15],[9,42,9,31],[-3,6,-3,7],[-15,8,13,-23]] equals reference.
* Custom INT8 extreme values on 2x2 (W=[[-7,3],[100,-128]], A rows [127,-128],[-5,9],[64,64],[-1,-1]) equals reference.
* PE: psum_out sequence -15, -21, -33 for the three demo cycles (a x -3 + psum_in).

## Files
* `site/` built offline page (index.html, app.js, app.css, page.css, circuits/*.json)
* `circuits/` Verilog inputs (pe.v, delay1.v, sa2.v, sa4.v) and the generated DigitalJS JSON
* `src/` page source (app.js, jq.js, jqui.js), converters (convert.mjs, flatten.mjs, pe_layout.mjs), test/capture scripts
  (capture.mjs, probe.mjs, check.mjs); `build.sh`, `package.json` (pinned: digitaljs 0.14.2, yosys2digitaljs 0.10.3, esbuild 0.28.2, playwright-core 1.64.1)
* `screenshots/` 19 PNGs, 1920x1080
* `video/npu_digitaljs_demo.mp4` 79 s, H.264 yuv420p, 1920x1080, 30 fps (each simulation step rendered by Playwright, assembled by ffmpeg)

Rebuild: `npm ci`; in `circuits/`: `node ../src/convert.mjs sa2 sa2.v pe.v delay1.v` (needs `yosys` on PATH), `node ../src/flatten.mjs sa2.json sa2_flat.json`; then `bash build.sh`.
(Scripts use the container paths /root/work_dj; adjust.)

## Screenshot captions
| File | Caption (as shown in the page) |
|---|---|
| screenshots/01_pe_static_layout.png | Reset done: All registers hold 0 and the clock is low. Press Step: first the inputs are applied (watch the multiplier and adder react), then the clock edge makes the registers capture the result. |
| screenshots/02_pe_inputs_applied_mid_computation.png | Cycle 0: inputs applied: Inputs are applied with the clock still low. The multiplier forms 5 x -3 = -15. The adder adds the partial sum arriving from above (0): 0 + -15 = -15. That total is only waiting at the register inputs - nothing is stored until the... |
| screenshots/03_pe_after_first_clock_edge.png | Cycle 0: clock edge: Rising clock edge. Both registers copy their inputs at the same instant: a_out = 5 (the activation, passed on to the PE on the right) and psum_out = -15 (the new running sum, passed to the PE below). |
| screenshots/04_pe_second_cycle_chained_sum.png | Cycle 1: clock edge: Rising clock edge. Both registers copy their inputs at the same instant: a_out = 2 (the activation, passed on to the PE on the right) and psum_out = -21 (the new running sum, passed to the PE below). |
| screenshots/05_pe_waveform_all_cycles.png | Cycle 2: clock edge: Rising clock edge. Both registers copy their inputs at the same instant: a_out = 4 (the activation, passed on to the PE on the right) and psum_out = -33 (the new running sum, passed to the PE below). |
| screenshots/06_sa2_static_layout.png | Reset done: Power-up: every register in the array is 0 and the clock is low. The 2x2 grid of cells already holds its weights (stationary). Press Step (or Run) to stream the rows of A in, one per clock cycle. |
| screenshots/07_sa2_cycle0_row0_enters.png | Cycle 0: inputs applied: Row 0 of A = [1, 2] is presented on the left edge (in_valid = 1). Row i is held back by i skew registers, so the numbers reach the grid as a diagonal wave. What each active cell computes right now (before the clock edge): PE(0,0):... |
| screenshots/08_sa2_cycle0_clock_edge.png | Cycle 0: clock edge: Rising clock edge. Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. |
| screenshots/09_sa2_cycle1_two_cells_active.png | Cycle 1: clock edge: Rising clock edge. Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. |
| screenshots/10_sa2_cycle2_wavefront.png | Cycle 2: clock edge: Rising clock edge. Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. out_valid = 1: a finished row leaves the bottom: C[0] = [7, 2] (reference [7,2]). |
| screenshots/11_sa2_cycle3_first_result_emerging.png | Cycle 3: clock edge: Rising clock edge. Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. out_valid = 1: a finished row leaves the bottom: C[1] = [23, 6] (reference [23,6]). |
| screenshots/12_sa2_cycle4_second_result.png | Cycle 4: clock edge: Rising clock edge. Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. out_valid = 1: a finished row leaves the bottom: C[2] = [-1, 0] (reference [-1,0]).... |
| screenshots/13_sa2_final_matches_reference_and_waveform.png | Cycle 4: clock edge: Rising clock edge. Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. out_valid = 1: a finished row leaves the bottom: C[2] = [-1, 0] (reference [-1,0]).... |
| screenshots/14_sa2_zoomed_pe_internals.png | Cycle 2: inputs applied: Row 2 of A = [-1, 0] is presented on the left edge (in_valid = 1). Row i is held back by i skew registers, so the numbers reach the grid as a diagonal wave. What each active cell computes right now (before the clock edge): PE(0,0)... |
| screenshots/15_sa4_static_layout.png | Reset done: Power-up: every register in the array is 0 and the clock is low. The 4x4 grid of cells already holds its weights (stationary). Press Step (or Run) to stream the rows of A in, one per clock cycle. |
| screenshots/16_sa4_cycle4_mid_computation.png | Cycle 4: inputs applied: No more rows of A: zeros are fed in (in_valid = 0) while the last results drain out. What each active cell computes right now (before the clock edge): PE(1,0): -3 x 3 + 2 = -7 PE(1,2): 6 x 0 + 10 = 10 PE(1,3): 2 x 2 + -1 = 3 PE(2,... |
| screenshots/17_sa4_zoomed_active_cells.png | Cycle 4: inputs applied: No more rows of A: zeros are fed in (in_valid = 0) while the last results drain out. What each active cell computes right now (before the clock edge): PE(1,0): -3 x 3 + 2 = -7 PE(1,2): 6 x 0 + 10 = 10 PE(1,3): 2 x 2 + -1 = 3 PE(2,... |
| screenshots/18_sa4_final_matches_reference.png | Cycle 9: clock edge: Rising clock edge. Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. out_valid = 1: a finished row leaves the bottom: C[3] = [-15, 8, 13, -23] (referenc... |
| screenshots/19_sa2_custom_int8_extreme_values_final.png | Cycle 5: clock edge: Rising clock edge. Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. out_valid = 1: a finished row leaves the bottom: C[3] = [-93, 125] (reference [-93,... |

## Licence note
DigitalJS and yosys2digitaljs are by Marek Materzok, BSD 2-Clause licence. The bundle in `site/` also contains DigitalJS dependencies
(JointJS core, jQuery, jQuery UI, elkjs, 3vl, ...) under their own licences. Our Verilog and page code: project licence.
