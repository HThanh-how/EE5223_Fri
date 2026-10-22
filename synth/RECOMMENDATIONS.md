# Recommendations (RTL not modified; numbers from results.md)

Device facts: LFE5U-85F (ULX3S, Colorlight i5 uses the 25F = 24k LUT, much smaller): 83.6k LUT4/FF, 156 MULT18X18D, 208 DP16KD (1.87 Mbit).

Finding: the array is cheap (PE = 1 MULT18X18D + ~32 LUT + 40 FF); area and timing are dominated by cmem/qmem being flip-flop arrays with DEPTH:1 muxes, because their writes are inside the async-reset always_ff.

1. Move cmem/qmem writes into their own `always_ff @(posedge clk)` without reset (what-if A): LUT4 -50..-55% (4_64: 18.7k -> 9.4k; 8_64: 36.7k -> 21.0k), FF -89% (11.5k -> 1.3k; 25.2k -> 4.7k), and the design then routes (baseline 4_64/8_32/8_64 did not converge; 4_64 39 MHz, 8_64 32 MHz vs 22/18 MHz placement-estimates). Same behaviour, 4-line change.
2. Make reads synchronous so yosys infers DP16KD instead of LUTRAM: register the cmem accumulate read address one cycle early (out_valid is predictable: in_valid delayed 2N-1) and keep Avalon readLatency=1 (already registered, just fold into the memory read). Expected: cmem 64x(N*32) -> N*32/36 ~ 4 BRAM at N=4, 8 at N=8 (DEPTH 64 fits one 512x36 BRAM per 32-bit lane-ish), removing most remaining mux LUTs (est. a further -5k LUT at 8_64; not measured).
3. Shorten the post path: pipeline post() (round/shift -> clamp -> ACT LUT) in 2 stages and share ONE requant unit across N lanes (time-multiplex over j) - saves N-1 copies of 2 MULT18X18D + shifters; at 8_64 -14 MULT. Also pipeline the sum_row add (cmem read -> add -> write).
4. Replace `idx / WPR`, `idx % N` style divides with shifts/slices (they are power-of-2 so yosys handles it, but make intent explicit), and avoid the `recv16 + 1 == m_cnt` 16-bit compare chain (use a registered last flag).
5. Realistic targets on LFE5U-85F (ULX3S): N=8, DEPTH=64 is feasible in resources after (1) (25% LUT, 80/156 MULT); N=8 with 64 MULTs for PEs leaves room up to N=12 (144 MULT) only if requant is shared. 50 MHz needs steps 2-3 (expA is still 32-39 MHz); 25-30 MHz works after (1) alone. Colorlight i5 (25F, 24k LUT, 28 MULT): N=4 DEPTH=32 (needs ~8k LUT after (1), 24 MULT) fits; N=4 needs requant sharing to leave MULTs (16 PE + 8). N=8 does not fit (80 MULT).
6. Don't expect baseline RTL to close timing on ECP5: only 4_32 routed (26.6 MHz).
