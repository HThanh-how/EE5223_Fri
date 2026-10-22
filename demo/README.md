# Demo kit - INT8 systolic-array NPU in a RISC-V SoC

Everything here is self-contained under `proj/demo/`. Nothing outside it is modified.

| File | Purpose |
|------|---------|
| `prepare.sh` | builds all binaries once (unit test, SoC testbench, firmware hex files) |
| `run_demo.sh` | the live demo, 5 stages, colored banners, `--pause`, `--only K`, `--quick`, `--save DIR`, `--n N` |
| `ascii_mnist.py` | ASCII-art digit viewer + stream filter that pretty-prints `img i label=L pred=P ...` log lines |
| `make_figures.py` | regenerates `figures/*.png` (300 dpi) from `results/*.log` and a VCD |
| `figures/` | a_cycles_cpu_vs_npu, b_cnn_profile, c_waveform_dataflow, d_block_diagram, e_accuracy_table |
| `data/sa_top_N4_head.vcd` | first ~65 cycles of the N=4 unit-test VCD (`make wave N=4`), used by figure c |
| `demo_output/` | captured plain-text output of each stage (backup if a live run fails) |
| `STORYBOARD.md` | Vietnamese scene-by-scene script, commands, narration (incl. FPGA placeholder) |

## Prerequisites
The flow runs on **LXC 180** (Verilator 5.032, riscv64-unknown-elf-gcc 14, python3, bash, GNU make, `stdbuf`).

```
ssh root@<lab-host>
pct exec 180 -- bash -l          # interactive shell inside the container
cd /root/proj                    # or any checkout of proj/ (must contain demo/)
```
Copy the kit into a checkout: `tar cf - demo | ssh root@<lab-host> 'pct exec 180 -- bash -c "tar xf - --no-same-owner -C /root/proj"'`
(the kit was tested in a private copy `/root/work_demo`, built from scratch).

For recording, run the demo in a terminal on a machine with a big font (>= 70 columns x 45 rows for the ASCII digit).

## Prepare (once, ~20 s)
```
demo/prepare.sh        # N=8 default; builds build_N4/Vsa_top, build_soc_N8/{Vtb_soc,*.hex}
```

## Run
```
demo/run_demo.sh --pause          # narrate: Enter starts each stage
demo/run_demo.sh                  # all stages back-to-back
demo/run_demo.sh --only 4         # only the CNN stage (repeat --only for several)
demo/run_demo.sh --quick          # CNN stops after 3 images
demo/run_demo.sh --save demo/demo_output   # also store plain-text logs
```
Stages: 1 unit test (`make test N=4`), 2 GEMM demo, 3 post-processing selftest, 4 LeNet-5 + ASCII digits, 5 LSTM batch 1 vs 16.

## Measured run times (LXC 180, N=8, from-scratch copy)
| Stage | Time |
|-------|------|
| prepare.sh | ~17-20 s |
| 1 unit test | < 1 s |
| 2 gemm_demo | ~1 s |
| 3 selftest | ~8 s |
| 4 CNN (8 images, CPU-only + NPU each) | ~120-135 s idle (197 s when the machine was loaded); `--quick` ~45 s |
| 5 LSTM (16 images) | ~30-38 s |
| Whole demo | ~3 min (173 s measured idle) |

The simulation speed is ~10 ms of simulated time per second, so the CNN stage is simply slow: cut or speed up the wait when editing the video, or narrate during it.

## Figures
`python demo/make_figures.py` (needs matplotlib, numpy; run it from a proj checkout containing `results/`; on Windows with system Python it was tested; the LXC venv `/root/venv-demo` also has matplotlib/numpy/vcdvcd but the LXC copy of proj has no `results/` directory). To use a fresh VCD: `make wave N=4` then `python demo/make_figures.py --vcd sa_top.vcd`.

## Notes
- Cycle counts in `results/` and `demo_output/` are reproducible (deterministic simulation); only wall-clock times vary.
- Accuracy table (figure e) uses the numbers from `model/README.txt` / the quantization run (float 98.83 -> INT8 98.85 for LeNet, 97.58 -> 97.50 for LSTM); it was not re-run.
- The FPGA (DE10-Nano / Nios V) segment is a placeholder in the storyboard (scene 9).
