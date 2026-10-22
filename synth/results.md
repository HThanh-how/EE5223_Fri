# Results (Yosys 0.52 / nextpnr-ecp5, ECP5 LFE5U-85F CABGA381, 50 MHz target, router2, seed 1, IO unconstrained)

Only numbers actually produced; raw logs in reports/. "pl" = post-placement estimate only (router had not finished).

## 1. Generic synth (`synth -flatten`)
| N_DEPTH | gate cells | FFs | memory bits | $mul (word level, before alumacc) |
|---|---|---|---|---|
| 4_64 | 86397 | 13616 | 0 (all memories became FFs, amem -> BRAM only after ecp5 libmap) | 16x 8x8 ($mul_16, PEs) + 4x 48b ($mul_48, requant) |
| 8_64 | 206697 | 29276 | 0 | 64x $mul_16 + 8x $mul_48 |
| 8_32 | 155074 | 16985 | 0 | 64 + 8 |
| 4_32 | 60366 | 7469 | 0 | 16 + 4 |
(The 48-bit requant multiply is really 32x16 -> mapped to 2 MULT18X18D each.)

## 2. synth_ecp5 + nextpnr (baseline RTL, unchanged)
| N_DEPTH | LUT4 (nextpnr, incl. carry/RAM LUTs) | FF | MULT18X18D | DP16KD | Fmax @50 MHz target | status |
|---|---|---|---|---|---|---|
| 4_32 | 13710 (16%) | 6461 | 24 | 0 (amem in 16 DPR16X4) | 26.6 MHz post-route | routed, timing FAIL |
| 4_64 | 20144 (24%) | 11552 | 24 | 1 | 22.4 MHz (pl) | router2 stuck: overuse ~17.5k at iter 21 (>50 min), killed |
| 8_32 | 28056 (33%) | 14969 | 80 | 0 (128 DPR16X4) | 19.4 MHz (pl) | router2 stuck: overuse ~13k at iter 27, killed |
| 8_64 | 42082 (50%) | 25212 | 80 | 0 (256 DPR16X4) | 18.4 MHz (pl) | router2 overuse ~47k at iter 9, killed |
All four FIT the device in resources (85k LUT / 83.6k FF) but are heavily congested; none meets 50 MHz; 100 MHz was not attempted on baseline (hopeless: <=27 MHz).
Default router1 did not converge for 4_64 in >30 min (logs in reports/old_router1/).

## 3. What-if "experiment A" (private RTL copy: cmem/qmem writes moved out of the async-reset block, so they stay memories; same function)
| N_DEPTH | LUT4 | FF | MULT | DP16KD | Fmax @50 | status |
|---|---|---|---|---|---|---|
| 4_64 | 9386 (11%) | 1312 | 24 | 1 (+288 DPR16X4) | 39.3 MHz post-route; 35.2 MHz when targeting 100 MHz | routed, FAIL 50/100 |
| 8_64 | 21043 (25%) | 4732 | 80 | 0 (832 DPR16X4) | 31.9 MHz post-route | routed, FAIL 50 |
| 4_32 | 7940 (9%) | 1341 | 24 | 0 | 33.6 MHz post-route | routed, FAIL 50 |
| 8_32 | 17855 (21%) | 4729 | 80 | 0 | 24.4 MHz (pl) | router still running at deadline, not finished |
cmem/qmem still map to distributed RAM (async read) not BRAM, because the read is combinational.

## 4. Intel ALM estimate (`synth_intel_alm -family cyclonev`, NOT a fit)
| N_DEPTH | ALUT2..6 + ARITH total | FF | MUL9x9 / MUL27x27 | M10K / MLAB |
|---|---|---|---|---|
| 4_64 | 258+447+5323+4873+1291+1695 = 13887 | 11613 | 24 / 4 | 1 / 0 |
| 8_64 | 643+1037+9609+9389+3285+4285 = 28248 | 25332 | 80 / 8 | 0 / 128 |
| 8_32 | 382+910+5619+5622+1276+4274 = 18083 | 15089 | 80 / 8 | 0 / 64 |
| 4_32 | 217+453+2698+2517+900+1691 = 8476 | 6490 | 24 / 4 | 1 / 0 |
(ALMs ~ between ALUT/2 and ALUT; DE10-Nano has 41910 ALMs, 112 DSP, 553 M10K - all fit on resources. Quartus will do better/differently: this is only an estimate.)

## 5. Where the area goes (synth_ecp5 -noflatten, N_DEPTH = 4_64 / 8_64)
| block | 4_64 | 8_64 |
|---|---|---|
| npu_avmm top (buffers, muxes, sequencer, requant) | LUT4 18385 + PFUMX 2916 + L6MUX 1204, FF 10693, MULT 8 | LUT4 36425 + PFUMX 5750 + L6MUX 2562, FF 21317, MULT 16, DPR 256 |
| each PE (x16 / x64) | 16 CCU2C (adder), 40 FF, 1 MULT18X18D | same |
| sa_top skew/deskew/weights | 69 LUT4, 128 FF | 1569 LUT4, 512 FF |
=> the systolic array is ~4-5% of area (8_64: 64 PEs ~ 2.1k CCU2 LUT-equivalents + 3k FF); ~90% is the buffers.
Memories: yosys warns "Replacing memory cmem/qmem with list of registers": because writes sit inside the `always_ff ... negedge reset_n` block, cmem (DEPTH*N*32 b) and qmem (DEPTH*N*8 b) become plain flip-flops with 64:1 (DEPTH:1) read muxes (two read ports on cmem: sequencer accumulate + Avalon read). 4_64: 8192+2048 = 10240 of the 11552 FFs. amem (separate always_ff) is a real memory: 1 DP16KD at 4_64, LUTRAM otherwise. Requant multiplies: 4 (N) 48-bit -> 2 MULT18X18D each, only ~8 MULT total at N=4; cheap in logic.
Critical path (4_32 baseline, 35.8 ns, 94% routing): recv FF -> DEPTH:1 mux of cmem[recv] -> 32-bit add with c_out (sum_row) -> wide carry/compare logic -> avs_readdata/control FFs. In expA 4_64: qmem output -> post() (round/shift/clamp/ReLU/LUT) chain, 17.7 ns. Unconstrained IO makes the Avalon-side paths appear but they are not the limiting factor in a real SoC.
