import json
caps = json.load(open('out/captions.json', encoding='utf8'))
rows = "\n".join(
    f"| screenshots/{c['file']} | {c['title']}: {c['text'][:230]}{'...' if len(c['text']) > 230 else ''} |" for c in caps)
r = f"""# DigitalJS circuit-level simulation of the INT8 systolic NPU

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
{rows}

## Licence note
DigitalJS and yosys2digitaljs are by Marek Materzok, BSD 2-Clause licence. The bundle in `site/` also contains DigitalJS dependencies
(JointJS core, jQuery, jQuery UI, elkjs, 3vl, ...) under their own licences. Our Verilog and page code: project licence.
"""
open('README.md', 'w', encoding='utf8').write(r)
