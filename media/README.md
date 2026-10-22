# Media for report and demo video

Generated programmatically (headless Chromium/Playwright, GTKWave under Xvfb, pdftoppm, ffmpeg) on LXC 180; the user's desktop was not captured.
All screenshots are in `screenshots/`, videos in `video/` (1920x1080, H.264 yuv420p).

## Browser visualizer (RTL of sa_top N=4 compiled to WASM)
| File | Caption |
|---|---|
| screenshots/viz_01_initial.png | Browser visualizer at cycle 0: 4x4 weight-stationary PE grid, phase tabs, W / A / C matrices. |
| screenshots/viz_02_weights_loaded.png | Phase 1: INT8 weights loaded into the PEs (they stay in place). |
| screenshots/viz_03_activations_skewed_entry.png | Phase 2: rows of A enter the left edge with one-cycle skew per row (diagonal wavefront). |
| screenshots/viz_04_mid_compute_partial_sums.png | Phase 3: mid computation, partial sums flowing down the columns. |
| screenshots/viz_05_partial_sums_flowing.png | Later cycle: partial sums and de-skew registers filling under the grid. |
| screenshots/viz_06_results_emerging.png | Phase 4: finished results emerging at the bottom, aligned as one row (out_valid). |
| screenshots/viz_07_final_matches_reference.png | Final state: result matrix C complete and the "matches the reference" badge (full page). |
| screenshots/viz_07b_final_viewport.png | Same final state, 1920x1080 viewport crop. |
| screenshots/viz_08_try_your_own_numbers_editor.png | "Try your own numbers" panel: editable INT8 matrices W and A. |
| screenshots/viz_08b_random_numbers_filled.png | Own-numbers editor with 6 random rows of A. |
| screenshots/viz_09a_own_numbers_mid.png | Custom input executed on the RTL, mid computation. |
| screenshots/viz_09b_own_numbers_final_matches.png | Custom input finished; RTL result matches the reference. |
| screenshots/viz_10_cnn_lstm_tab_top.png | CNN tab: im2col patches times filters executed on the same array. |
| screenshots/viz_11_cnn_lstm_tab_bottom.png | LSTM tab: one time step [x_t, h_t-1] x W, gates computed by the RTL. |
| video/npu_viz_animation_demo.mp4 | About 90 s screen recording of the visualizer: step-through, autoplay, restart at 2x, CNN/LSTM tab, own numbers. |

## Terminal views (from demo/demo_output and results logs; syntax-coloured)
| File | Caption |
|---|---|
| screenshots/term_stage1_unit_test.png | Stage 1: systolic array unit tests (RTL vs golden model), N=4, 26 tests ALL PASS. |
| screenshots/term_stage2_gemm_soc.png | Stage 2: PicoRV32 + NPU GEMM over Avalon-MM, CPU vs NPU cycles, 0 mismatches. |
| screenshots/term_stage3_selftest.png | Stage 3: post-processing self-test (bias, requant, ReLU/sigmoid/tanh LUT), ALL PASS. |
| screenshots/term_stage4_cnn_first_image.png | Stage 4: LeNet-5 INT8 on the first MNIST test image, CPU-only vs CPU+NPU cycles. |
| screenshots/term_stage4_cnn_per_image_results.png | Stage 4: per-image LeNet-5 results (label, prediction, cycles, 6.89x speedup). |
| screenshots/term_stage4_cnn_summary.png | Stage 4: LeNet-5 summary, average speedup 6.89x, 8/8 correct, ALL PASS. |
| screenshots/term_stage5_lstm_batch.png | Stage 5: LSTM batch=1 (3.33x) vs batch=16 (16.38x) speedup over the CPU. |
| video/terminal_cnn_lstm_replay.mp4 | About 23 s animated terminal replay: typed commands, CNN (first image + summary) and LSTM output line by line. |

## GTKWave (real waveforms from demo/data/sa_top_N4_head.vcd, N=4)
Signals: clk, rst_n, w_we, w_widx, w_wdata, in_valid, a_in (hex), out_valid, c_out (hex, 128 bit, truncated in cell). Time unit is 1 tick = 1 clock half period.
| File | Caption |
|---|---|
| screenshots/gtkwave_full.png | Whole captured run: reset, weight load, input stream, result stream. |
| screenshots/gtkwave_first30.png | First ~30 cycles: reset release, weight write, start of activation stream. |
| screenshots/gtkwave_weights_and_inputs.png | Weight loading (w_we/w_widx/w_wdata) followed by in_valid with skewed a_in words. |
| screenshots/gtkwave_output_valid.png | in_valid ends and out_valid goes high; c_out rows emerge (latency visible). |
| screenshots/gtkwave_second30.png | Later part of the run: second burst. |

## Report pages (report_preview.pdf, 110 dpi)
| File | Caption |
|---|---|
| screenshots/report_page_01-01.png | Report cover page. |
| screenshots/report_page_16-16.png | Chapter 2: input skew in the weight-stationary array. |
| screenshots/report_page_22-22.png | Chapter 4: hardware architecture, start. |
| screenshots/report_page_24-24.png | Chapter 4.3: sa_top systolic array. |
| screenshots/report_page_33-33.png | Chapter 6: verification, table of sa_top unit tests. |
| screenshots/report_page_36-36.png | Chapter 7: results, single GEMM cycles table. |
| screenshots/report_page_37-37.png | Figure 7.1: cycles per image on PicoRV32, LeNet-5 and LSTM. |
| screenshots/report_page_38-38.png | Figure 7.2: host-side profile of one LeNet-5 image. |
| screenshots/report_page_39-39.png | Table 7.5: LSTM average cycles per image. |
| screenshots/report_page_44-44.png | Table 8.3: DE10-Nano whole-system resources. |

## Tables as images (light background)
| File | Caption |
|---|---|
| screenshots/table_quartus_fit_n4_n8.png | Quartus fit summary: ALMs, registers, DSP, M10K and Fmax for fpga vs orig RTL, N=4/8, 50/100 MHz. |
| screenshots/table_de10_whole_system_fit.png | DE10-Nano whole-system Quartus fit summary (Cyclone V 5CSEBA6U23I7). |
| screenshots/table_ecp5_yosys_1.png | Yosys generic synthesis results (gate cells, FFs, multipliers). |
| screenshots/table_ecp5_yosys_2.png | Yosys/nextpnr ECP5 results for the baseline RTL. |
| screenshots/table_ecp5_yosys_3.png | ECP5 what-if "experiment A" (memories kept as RAM). |
| screenshots/table_ecp5_yosys_4.png | Intel ALM estimate from synth_intel_alm (not a fit). |
| screenshots/table_ecp5_yosys_5.png | Where the area goes (per block, N_DEPTH 4_64 / 8_64). |

Not produced: preflight summary screenshot (no preflight log exists in the repo).
