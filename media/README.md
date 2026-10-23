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
| screenshots/table_de10_whole_system_fit.png | DE10-Nano whole-system fit per variant (same image as table_de10_variants.png; replaces the earlier single-variant version). |
| screenshots/table_de10_variants.png | DE10-Nano per-variant table: PicoRV32, Nios V/g, /m, /c with rtl_fpga and Nios V/g with the original RTL: ALMs, regs, M10K, DSP, Fmax slow 100C/-40C, worst setup/hold slack, licence warning. Built and timing-closed, not yet run on the board. |
| screenshots/table_de10_memmap_led_sof.png | DE10-Nano memory map, LED meanings and recommended SOF order (PicoRV32 first). Built and timing-closed, not yet run on the board. |
| screenshots/table_ecp5_yosys_1.png | Yosys generic synthesis results (gate cells, FFs, multipliers). |
| screenshots/table_ecp5_yosys_2.png | Yosys/nextpnr ECP5 results for the baseline RTL. |
| screenshots/table_ecp5_yosys_3.png | ECP5 what-if "experiment A" (memories kept as RAM). |
| screenshots/table_ecp5_yosys_4.png | Intel ALM estimate from synth_intel_alm (not a fit). |
| screenshots/table_ecp5_yosys_5.png | Where the area goes (per block, N_DEPTH 4_64 / 8_64). |

Not produced: preflight summary screenshot (no preflight log exists in the repo).

## Simulation evidence (sim_ prefix)
SoC waveforms are real Verilator VCDs of the PicoRV32 + NPU SoC (N=4), windowed with a small trimming script; clock period 10 ns. gemm_demo VCD for (a), (b), (c-M8); firmware selftest VCD (first 12 s of wall time, trial 1: M=64, ReLU) for (c) accum/quant and (d).
| File | Caption |
|---|---|
| screenshots/sim_preflight_summary.png | Preflight (quick) summary: 18 passed, 0 failed, 1 warning (quantize regenerate, numpy missing in that environment). |
| screenshots/sim_test_inventory.png | Table of everything simulated and passed: array unit test, GEMM demo, self-test, LeNet-5, LSTM, preflight, for N=4 and N=8. |
| screenshots/sim_soc_a_avalon_writes.png | CPU to NPU over Avalon-MM (gemm_demo, N=4): avs_address/avs_write/avs_writedata bursts as the firmware writes weights and activations, then avs_read/readdata/readdatavalid. |
| screenshots/sim_soc_a2_avalon_write_zoom.png | Zoom on a single Avalon write transaction. |
| screenshots/sim_soc_b_start_busy_done.png | start_req pulse, busy, done, sent/recv counters, then the CPU reading back result words (avs_readdata with readdatavalid). |
| screenshots/sim_soc_b2_start_busy_done_zoom.png | Zoom on start -> busy -> done for M=1, with in_valid/out_valid. |
| screenshots/sim_soc_c_npu_run_gemm_M8.png | Inside the NPU during one M=8 run (gemm_demo): in_valid with a_in rows, out_valid with c_out rows, sent/recv counters. |
| screenshots/sim_soc_c_npu_accum_quant.png | Inside the NPU during a post-processing run (selftest trial 1, M=64): accum_f and quant_f flags, 64 input rows on a_in and 64 result rows on c_out. |
| screenshots/sim_soc_c2_npu_accum_quant_zoom.png | Zoom on the first cycles of the same run. |
| screenshots/sim_soc_d_requant_pipeline.png | Requant pipeline over a 64-row run: va, arow (0..63), prod[0..3] (signed decimal), q_row_data, q_act=1 (ReLU), q_shift=8, q_mult=10713. |
| screenshots/sim_soc_d2_requant_pipeline_zoom.png | Zoom on the first rows of the requant pipeline (readable products). |
| screenshots/sim_annotated_sa_top_waveform.png | Annotated sa_top waveform: weights loaded once and stationary, skewed input rows, first result about 2N-1 cycles (7 for N=4) after first input (measured spacing is about 6.5 clocks on the waveform, so read as approximate), result rows streaming out. |

## Model and performance figures (test_ prefix, 300 dpi, matplotlib)
Accuracy and logits are computed by running the bit-exact integer golden models (scripts/quantize.py) over all 10,000 MNIST test images. Cycle numbers come from results/*.log (8 CNN images, 16 LSTM images; 1 run per configuration).
| File | Caption |
|---|---|
| screenshots/test_01_confusion_lenet_int8.png | LeNet-5 INT8 confusion matrix, 10,000 test images (98.85% accuracy). |
| screenshots/test_02_confusion_lstm_int8.png | LSTM INT8 confusion matrix, 10,000 test images (97.50% accuracy). |
| screenshots/test_03_per_class_accuracy_lenet.png | LeNet-5 per-class accuracy, float (98.83%) vs INT8 (98.85%). |
| screenshots/test_04_per_class_accuracy_lstm.png | LSTM per-class accuracy, float (97.58%) vs INT8 (97.50%). |
| screenshots/test_05_digit_grid_lenet.png | 35 consecutive test digits plus 5 misclassified ones with true/predicted labels (LeNet-5 INT8; wrong ones in red). |
| screenshots/test_06_digit_grid_lstm.png | Same grid for the LSTM INT8 model. |
| screenshots/test_07a_lenet_layers_digit0.png | LeNet-5 INT8 layer by layer for test digit 0 (label 7): conv1 maps, pool, conv2 maps, fc activations, final logits. |
| screenshots/test_07b_lenet_layers_digit1.png | Same for test digit 1 (label 2). |
| screenshots/test_07c_lenet_layers_digit3.png | Same for test digit 3 (label 0). |
| screenshots/test_08a_lstm_dynamics_digit0.png | LSTM INT8 for test digit 0: gates i/f/g/o, cell state, hidden state over the 28 row steps, final logits. |
| screenshots/test_08b_lstm_dynamics_digit1.png | Same for test digit 1. |
| screenshots/test_09_weight_histograms_lenet.png | LeNet-5 weight histograms per layer, float vs symmetric per-tensor INT8. |
| screenshots/test_09_weight_histograms_lstm.png | LSTM weight histograms (gates, fc), float vs INT8. |
| screenshots/test_10_activation_scale_saturation_lenet.png | Per-layer requant multiplier/shift, saturation percentage and ReLU zeros (first 500 test images). |
| screenshots/test_11a_logit_scatter_lenet.png | LeNet-5 float vs INT8 logits scatter (scale fitted by least squares), correlation and error histogram. |
| screenshots/test_11b_logit_scatter_lstm.png | Same for the LSTM. |
| screenshots/test_12_lut_sigmoid_tanh_vs_exact.png | The 256-entry INT8 sigmoid and tanh LUTs against the exact functions, with the error in LSB. |
| screenshots/test_13_requant_pipeline_conv2.png | Requantisation stages on real conv2 channel-3 values: accumulator, +bias, x mult >> shift, clamp, ReLU. |
| screenshots/test_14_accuracy_summary.png | Accuracy summary, float vs INT8, LeNet-5 and LSTM. |
| screenshots/test_15_bit_exact_mismatches.png | Mismatch counts vs golden from the N=4/N=8 simulation logs (all zero). |
| screenshots/test_16_cycles_per_image.png | Cycles per image: LeNet-5 CPU-only vs CPU+NPU, LSTM CPU vs NPU batch 1 and 16, N=4 and N=8. |
| screenshots/test_17_npu_calls_per_image.png | NPU calls per image from the logs: LeNet-5 2964 (N=4) / 741 (N=8), LSTM 5392 / 1348. |
| screenshots/test_18_n4_vs_n8_comparison.png | N=4 vs N=8: NPU busy cycles and speed-ups for both networks. |
| screenshots/test_19_array_latency_utilisation.png | Systolic compute cycles vs M with measured points from the logs. Measured npu_compute equals 2N+M, which is 2 cycles above the 2N-1+M-1 array pipeline formula (sequencer overhead is an inference, not measured). Utilisation = M/npu_compute. |

Not produced: LSTM batch-size sweep (logs contain only batch 1 and 16, shown in test_16 and test_18); preflight image shows the quick preflight only.
