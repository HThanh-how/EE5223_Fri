# Open-source synthesis / P&R of npu_avmm (Yosys + nextpnr-ecp5)

Everything runs on LXC 180 in a private copy `/root/work_synth` (copy of `proj/rtl`, nothing in `proj/` outside `synth/` is modified).

## Tool notes
- Yosys 0.52 core reads the RTL as-is with `read_verilog -sv -I rtl ...` (unpacked arrays, always_ff, functions, `int'()`, `$clog2`, `include`). No sv2v / yosys-slang needed. Only warnings: "Replacing memory ... with list of registers" (see RECOMMENDATIONS.md - this is the main finding).
- Parameters are set with `chparam -set N <n> -set DEPTH <d> npu_avmm` after reading.
- nextpnr: `nextpnr-ecp5 --85k --package CABGA381 --freq F --lpf-allow-unconstrained --seed 1 --router router2` (default router1 did not converge in 30+ min on the 4_64 netlist; router2 is used for all reported Fmax values).
- Fmax numbers are post-route, IO unconstrained (all IO paths ignored by clock constraint except as reported), single seed.

## Re-run
```
tar cf - -C /path/to/proj rtl | ssh root@<lab-host> 'pct exec 180 -- bash -c "mkdir -p /root/work_synth && tar xf - --no-same-owner -C /root/work_synth"'
tar cf - -C synth scripts   | ssh root@<lab-host> 'pct exec 180 -- bash -c "mkdir -p /root/work_synth && tar xf - --no-same-owner -C /root/work_synth"'
# on LXC 180:
cd /root/work_synth/scripts; mkdir -p ../reports
make -j3 all            # generic_*, hier_*, ecp5_*, alm_* for 4_64 8_64 8_32 4_32  (CFGS="..." to subset)
make word_4_64 ecp5h_4_64 ecp5h_8_64   # pre-alumacc $mul widths; per-module ECP5 mapping
make pnr50_4_32 pnr100_4_32            # nextpnr (slow: minutes to tens of minutes)
bash mk_exp_A.sh; make expA_4_64 expA_8_64 pnrA50_4_64   # what-if: cmem/qmem kept as memories
bash collect.sh                         # summary tables
```
Layout: `scripts/` (Makefile, mk_exp_A.sh, collect.sh), `reports/` (raw yosys/nextpnr logs + .stat), `results.md`, `RECOMMENDATIONS.md`.
