# quartus_fit - standalone Quartus fit of npu_avmm (5CSEBA6U23I7, Quartus Lite 25.1std)

## Status
- DONE and run: 4 Quartus compiles of the original RTL and 4 of the FPGA variant (N=8/4 x 50/100 MHz). All fit and met timing.
- DONE and run: regression of the variant in Verilator (LXC 180, /root/work_fit): `make test N=4/8` (26 tests ALL PASS), `make soc` selftest/cnn/lstm for N=4 and N=8, all RESULT: ALL PASS, logits match golden (firmware self-checks). Logs: reports/regression/.
- NOT done: no board/Qsys integration, no power analysis, no 85C model (Quartus reports the I7 grade as "Slow 1100mV 100C", used below).

## Results (all virtual pins except clk; HIGH PERFORMANCE EFFORT; numbers from reports/*.fit.summary / *.sta.rpt)
| run | ALMs | regs | DSP | M10K | mem bits | Fmax slow 100C (MHz) |
|---|---|---|---|---|---|---|
| orig N=8 @50  | 18,521 (44%) | 25909 | 48 | 4  | 720    | 52.2 |
| orig N=8 @100 | 18,652 | 25899 | 48 | 4  | 720    | 51.3 |
| fpga N=8 @50  | 2,187 (5%)  | 2628  | 48 | 24 | 41,720 | 127.5 |
| fpga N=8 @100 | 2,188  | 2631  | 48 | 24 | 41,720 | 127.6 |
| orig N=4 @50  | 8,899 (21%) | 12899 | 16 | 0  | 0      | 55.7 |
| orig N=4 @100 | 8,928  | 12915 | 16 | 0  | 0      | 56.0 |
| fpga N=4 @50  | 1,148 (3%)  | 1306  | 16 | 11 | 20,515 | 133.9 |
| fpga N=4 @100 | 1,141  | 1316  | 16 | 11 | 20,515 | 139.3 |
Full table: reports/summary_table.md. The original barely meets 50 MHz (~52-56 MHz) and misses 100 MHz; the variant meets 100 MHz with margin.

## What changed (rtl_fpga/, diff in rtl_fpga.diff)
1. Quartus Lite only accepts SV-2005: added `generate/endgenerate` and module-level `genvar` declarations in delay.sv, sa_top.sv, npu_avmm.sv (pure syntax). The ORIGINAL had to get the same wrapping to compile at all (`scripts/make_compat.py` -> rtl_orig_q/, used for the "orig" numbers; no semantic change).
2. npu_avmm.sv: new `npu_ram` module (simple dual port, sync read, `ramstyle M10K`). amem = WPR banks of 32 bit (row read in one cycle); cmem = N column banks x 2 copies (one read port for accumulate, one for Avalon CBUF reads); qmem = WPR banks.
3. Result path pipelined: c0 read cmem, c1 add, c2 cmem write (+done if no QUANT) and +bias, c3 32x16 multiply (DSP), c4 rounding add, c5 shift+clamp, c6 activation, c7 qmem write (+done). Read path keeps latency 1 (registered selects, RAM output muxed combinationally; avs_readdata no longer a plain flop).
4. Register map, STATUS/done semantics, results unchanged. CYCLES (busy cycles) is larger by a few pipeline cycles per call (not individually measured). Whole-run cnn/lstm busy counts rise modestly (e.g. cnn N8 npu_busy_share 89 -> 98 x100, lstm N8 busy/img 23142 -> 26742); total npu_cyc nearly unchanged (cnn N8 1923665 -> 1925071). sa_top/pe unchanged except syntax wrapping, so the standalone sa_top `make test` is unaffected.
Caveat: avs reads of CBUF/QBUF during busy return the (partially updated) committed data like before, but with a pipeline delay of the final writes; firmware only reads after done.

## Re-run
- Quartus (LXC 190, as root works): `scripts/run_fit.sh <rtl_dir> <N> <MHz> <tag>` (creates /root/ee5223/fit/run_<tag>_N<N>_<MHz>), `scripts/collect.sh` gathers reports, `python3 scripts/summarize.py` tabulates. Original RTL: first `python3 scripts/make_compat.py ../rtl rtl_orig_q`.
- Regression: copy rtl_fpga/* over proj/rtl copy, then `make test N=4|8`, `make soc N=4|8 FW=selftest|cnn|lstm`.
