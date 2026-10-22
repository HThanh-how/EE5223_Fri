# DE10-Nano: Nios V + INT8 systolic NPU

Board: Terasic DE10-Nano (Cyclone V SoC 5CSEBA6U23I7), 50 MHz FPGA_CLK1_50.
Toolchain: Quartus Prime Lite 25.1std + Platform Designer, Nios V toolchain
(riscv32-unknown-elf-gcc 13.2 from `riscfree/toolchain`, `elf2hex`, `niosv-download`).

> STATUS: see "Status / what was verified" at the end of this file. It lists exactly
> what was run and what was not.

## Files

| Path | What |
|---|---|
| `ip/npu_avmm_hw.tcl` | Platform Designer component for `npu_avmm` (params N, DEPTH; Avalon-MM slave, 14-bit word address, readdatavalid, waitrequest). **The RTL variant and file list are set in ONE place at the top of this file** (`NPU_RTL_VARIANT ref|fpga`, or `export NPU_RTL_VARIANT=fpga`). |
| `scripts/make_compat.py` | Makes `rtl_compat/`, a syntax-only SV-2005 copy of `proj/rtl`. Quartus Lite does not accept generate blocks that have no `generate/endgenerate`, so this step is needed. `proj/rtl` is not modified. The `fpga` variant (`proj/quartus_fit/rtl_fpga`) is already compatible. |
| `scripts/create_system.tcl` | Creates `system.qsys` with qsys-script. Env: `NIOSV_CORE`, `NPU_N`, `NPU_DEPTH`, `FW_HEX` |
| `scripts/build.sh` | Full flow: firmware, make_compat, qsys-script, qsys-generate, `quartus_sh --flow compile`, reports to `reports/`, SOF/ELF/HEX to `out/` |
| `rtl/de10_nano_top.sv` | Top level: clock, KEY0 reset (synchronised, plus a power-on reset), LEDs |
| `de10_nano_npu.qpf/.qsf/.sdc` | Quartus project. The SDC has a 50 MHz clock, `derive_pll_clocks`, `derive_clock_uncertainty`, the JTAG clock, and false paths on KEY/LED |
| `fw/` | Bare-metal Nios V firmware (no HAL): `platform.h`, `platform.c`, `crt0.S`, `link.ld`, `Makefile` |
| `sim/tb_de10_map.sv`, `sim/run_sim.sh` | Open-source firmware check on the DE10 memory map (PicoRV32 stands in for Nios V, see Status) |
| `env.sh` | PATH setup for Quartus 25.1std on LXC 190 |
| `out/` | Built artefacts: `.sof`, `.elf`, `.hex` |
| `reports/` | Quartus reports: fit/sta summaries, `utilization_by_entity.txt`, `fmax.txt` |

## Pin assignments (verified)

Source: Terasic DE10-Nano System CD golden top `DE10_Nano_golden_top.qsf`
(`Demonstrations/FPGA/Golden_top`), read from GitHub
`Liangqiufenghong/Avalon-bus/IntelFPGA/Board/DE10_NANO/Demonstrations/FPGA/Golden_top/`.
The KEY pins are the same as in MiSTer `sys.tcl`.

| Signal | Pin | | Signal | Pin |
|---|---|---|---|---|
| FPGA_CLK1_50 | V11 | | LED[0] | W15 |
| KEY[0] (reset) | AH17 | | LED[1] | AA24 |
| KEY[1] (unused) | AH16 | | LED[2] | V16 |
| | | | LED[3] | V15 |
| | | | LED[4] | AF26 |
| | | | LED[5] | AE26 |
| | | | LED[6] | Y16 |
| | | | LED[7] | AA23 |

All pins use 3.3-V LVTTL.

LED meaning:

| LED | Meaning |
|---|---|
| LED0 | Heartbeat (the FPGA is configured) |
| LED1 | Firmware running |
| LED2 | Firmware finished |
| LED3 | PASS |
| LED4 | FAIL |
| LED5 | Unexpected CPU trap |

## Memory map (Nios V data manager)

| Base | Size | Slave |
|---|---|---|
| `0x0000_0000` | 256 KiB | `ram`: on-chip RAM, reset vector 0x0, initialised from `onchip_init.hex` |
| `0x2000_0000` | 64 KiB | `npu.avs`: npu_avmm. This is `NPU_BASE`, the same value as the PicoRV32 sim, so `fw/npu.h` needs no change |
| `0x2001_0000` | 64 KiB | `cpu.dm_agent`: Nios V debug module |
| `0x2002_0000` | 64 B | `cpu.timer_sw_agent`: `mtime` (counts 1 per clk) and `mtimecmp` |
| `0x2002_0040` | 8 B | `jtag_uart` (write FIFO 1024 B) |
| `0x2002_0050` | 16 B | `led_pio` (8-bit output) |

On Nios V/g, `0x2000_0000..0x2003_FFFF` is set as peripheral region A, which is uncached. The NPU is therefore never accessed through the D-cache.

The instruction manager can reach only `ram` and `dm_agent`.

The NPU sits in the ref configuration: N=8, DEPTH=64.

## Firmware

The firmware reuses `proj/fw` unchanged.

How `fw/platform.h` replaces `proj/fw/common.h`:
- `platform.h` is force-included (`gcc -include platform.h`) and defines the same include guard, `COMMON_H`. A plain `-I` path could not do this, because `proj/fw/*.c` include `"common.h"` relative to their own directory.
- `putc_` writes to the JTAG UART. It drops characters if no host drains the FIFO for about 1 s.
- `rdcycle()` reads `mtime`, which advances 1 tick per clock.

`nn.h` uses the `rdcycle` instruction directly. If the core traps on it, `crt0.S` and `platform.c` catch the illegal-instruction trap and emulate `cycle/time/instret` from `mtime`.

`main()`'s return value is printed as `[niosv] exit code N` and shown on the LEDs.

Memory layout:
- The load image (code, rodata, and the initial `.data`) occupies `0x0..0x1BFFF`.
- `.data`, `.bss` and the stack (top `0x40000`) occupy `0x1C000..0x3FFFF`.
- `.data` is re-copied on every reset, so pressing KEY0 re-runs the program cleanly.

Build:

```
source env.sh; make -C fw N=8          # build/{selftest,cnn,lstm}.{elf,hex,bin,lst,map}
```

Flags: `-march=rv32im_zicsr -mabi=ilp32 -O2`.

Firmware sizes:

| Program | text | data | bss |
|---|---|---|---|
| selftest | 6.9 KB | 4 B | 3.2 KB |
| cnn | 65.9 KB | – | 36.0 KB |
| lstm | 24.2 KB | – | 3.2 KB |

## Build the SOF (LXC 190, /root/ee5223/de10)

```
source env.sh
FW=selftest scripts/build.sh                 # program baked into on-chip RAM: selftest|cnn|lstm
NPU_RTL_VARIANT=fpga scripts/build.sh        # use quartus_fit/rtl_fpga instead of proj/rtl
NIOSV_CORE=intel_niosv_m scripts/build.sh    # smaller core
NPU_N=4 scripts/build.sh                     # fallback array size (also builds fw with NN=4)
```

To change only the program in an already compiled SOF, skip the re-fit: copy the new `.hex` to `onchip_init.hex`, then run `quartus_cdb de10_nano_npu -c de10_nano_npu --update_mif` and `quartus_asm de10_nano_npu`. Or download the ELF over JTAG as described below.

## On the board (Windows PC, USB-Blaster II via the DE10-Nano mini-USB)

Open a "Nios V Command Shell", or any shell with `quartus\bin64` and `niosv\bin` on PATH.

```
quartus_pgm -l                                          # find the cable, e.g. "DE-SoC [USB-1]"
quartus_pgm -c 1 -m JTAG -o "p;out\de10_nano_npu.sof@2" # device 2 = FPGA (device 1 = HPS SOCVHPS)
juart-terminal -c 1 -d 2 -i 0                           # JTAG UART console (keep open)
```

If the SOF is `*_time_limited.sof` (OpenCore Plus, see Status), `quartus_pgm` keeps running. Leave it running, because closing it stops the design.

The SOF already contains `selftest` in RAM. Press KEY0 to re-run it.

Run another program without recompiling (in a second shell):

```
niosv-download -g -c 1 -d 2 out\cnn.elf     # -g: reset + run after download
niosv-download -g -c 1 -d 2 out\lstm.elf
niosv-download -g -c 1 -d 2 out\selftest.elf
```

If `-d` or `-c` differ on your PC, `jtagconfig` lists the cable and device indices.

Expected console output comes from `proj/results/*_N8.log`. Cycle counts differ because Nios V and cache timing differ from PicoRV32.

selftest:
```
selftest N=8
trial 0 M=1 act=0 mult=32767 shift=0 PASS
... (24 trials, all PASS)
RESULT: ALL PASS
[niosv] exit code 0          (LED3 on)
```

cnn (8 MNIST images):
```
LeNet-5 INT8, N=8
  profile(img0): weight_wr=... act_wr=... run+poll=... result_rd=... other(...)=...
img 0 label=7 pred=7 cpu_cyc=... npu_cyc=... npu_busy=17298 calls=741 mism(cpu/npu vs golden)=0/0
... img 1..7 labels 2 1 0 4 1 4 9, all pred == label
correct=8/8
RESULT: ALL PASS
```

lstm:
```
LSTM INT8, N=8 images=16
... correct=16/16 (batch 1 and batch 16)
mismatches vs golden: 0
RESULT: ALL PASS
```

`npu_busy` (NPU-internal cycles) matches the simulation exactly for the reference RTL. The `cpu_cyc` and `cycles/img` values do not.

At 50 MHz the CNN CPU-only reference takes several seconds per image on the CPU, so `cnn` runs for tens of seconds.
