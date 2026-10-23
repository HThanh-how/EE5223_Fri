# DE10-Nano: Nios V + INT8 systolic NPU

Board: Terasic DE10-Nano (Cyclone V SoC 5CSEBA6U23I7), 50 MHz FPGA_CLK1_50.
Toolchain: Quartus Prime Lite 25.1std + Platform Designer, Nios V toolchain
(riscv32-unknown-elf-gcc 13.2 from `riscfree/toolchain`, `elf2hex`, `niosv-download`).

> STATUS: see "Status / what was verified" at the end of this file. It lists exactly
> what was run and what was not.

> **Fresh clone note:** the Platform Designer output (`system_pico/`, `system/synthesis/`) is generated, not stored in git. Before opening a `.qpf` in the Quartus GUI run `bash scripts/generate_ip.sh pico` (or `niosv`), otherwise Quartus fails with `system_pico/synthesis/system_pico.qip not found` and `undefined entity "system_pico"`. Prebuilt `.sof` files are in the GitHub release, so compiling is optional.

## Files

| Path | What |
|---|---|
| `ip/npu_avmm_hw.tcl` | Platform Designer component for `npu_avmm` (params N, DEPTH; Avalon-MM slave, 14-bit word address, readdatavalid, waitrequest). **The RTL variant and file list are set in ONE place at the top of this file** (`set NPU_RTL_VARIANT fpga|ref`, default **fpga** = `proj/quartus_fit/rtl_fpga`; or `export NPU_RTL_VARIANT=ref` to use `proj/rtl`). |
| `scripts/make_compat.py` | Used only by the `ref` variant. Makes `rtl_compat/`, a syntax-only SV-2005 copy of `proj/rtl`. Quartus Lite does not accept generate blocks that have no `generate/endgenerate`, so this step is needed. `proj/rtl` is not modified. The `fpga` variant (`proj/quartus_fit/rtl_fpga`) is already compatible. |
| `scripts/create_system.tcl` | Creates `system.qsys` with qsys-script. Env: `NIOSV_CORE`, `NPU_N`, `NPU_DEPTH`, `FW_HEX` |
| `scripts/build.sh` | Full flow: firmware, make_compat, qsys-script, qsys-generate, `quartus_sh --flow compile`, reports to `reports/`, SOF/ELF/HEX to `out/` |
| `rtl/de10_nano_top.sv` | Top level: clock, KEY0 reset (synchronised, plus a power-on reset), LEDs |
| `de10_nano_npu.qpf/.qsf/.sdc` | Quartus project. The SDC has a 50 MHz clock, `derive_pll_clocks`, `derive_clock_uncertainty`, the JTAG clock, and false paths on KEY/LED |
| `fw/` | Bare-metal Nios V firmware (no HAL): `platform.h`, `platform.c`, `crt0.S`, `link.ld`, `Makefile` |
| `sim/tb_de10_map.sv`, `sim/run_sim.sh` | Open-source firmware check on the DE10 memory map (PicoRV32 stands in for Nios V, see Status) |
| `env.sh` | PATH setup for Quartus 25.1std on LXC 190 |
| `out/` | SOFs per CPU and program, `.elf`/`.hex` per CPU, `SHA256SUMS.txt` |
| `reports/<variant>/` | Quartus reports per variant (fit/sta summaries, utilization_by_entity, fmax, compile log) |
| `BOARD_RUNBOOK.md` | 5-minute on-board plan (Vietnamese) |
| `ip/picorv32_avmm*`, `scripts/create_system_pico.tcl`, `scripts/build_pico.sh`, `de10_nano_npu_pico.qpf/.qsf` | Licence-free PicoRV32 fallback system |
| `sim/run_elf.sh`, `sim/tb_pico_avmm.sv`, `sim/run_pico_sim.sh` | Run the final ELFs; PicoRV32 Avalon bridge check with random waitrequest |

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

The NPU is configured as N=8, DEPTH=64.

## Firmware

The firmware is bare-metal and reuses `proj/fw` without changes.

`fw/platform.h` is force-included with `gcc -include`. It defines the same include guard as `proj/fw/common.h`, so it replaces that file:
- `putc_` writes to the JTAG UART. If no host drains the UART for about 1 s, it drops characters.
- `rdcycle()` reads mtime-low at `0x2002_0000`, which counts one tick per clock.
- A GNU-as macro redefines the mnemonic `rdcycle`, so `nn.h`'s inline `rdcycle` becomes `lui rd,0x20020; lw rd,0(rd)`.

**No counter CSR remains anywhere in the firmware.** I checked the disassembly. The only CSR instructions left are `csrw mtvec` in crt0 and `csrr mcause`/`csrr mepc` in the unexpected-trap reporter.

`main()`'s return value is printed as `[niosv] exit code N` (the text is the same on every CPU) and also drives the LEDs.

Memory layout:
- Load image: `0x0..0x1BFFF`.
- `.data`, `.bss` and the stack: `0x1C000..0x3FFFF`.
- `.data` is re-copied on every reset, so KEY0 re-runs the program cleanly.

The hex files are Intel HEX with one 32-bit word per record (`elf2hex --record=4`). With the default 32-byte records, Quartus printed "wrapping data" warnings.

| Target | CPU | `-march` | Output dir |
|---|---|---|---|
| `make` | Nios V/g | rv32im_zicsr | `fw/build/` |
| `make rv32i` | Nios V/m and /c (RV32I only, per Intel `intel_niosv_m_callbacks.tcl`; multiply/divide go through libgcc) | rv32i_zicsr | `fw/build_rv32i/` |
| `make pico` | PicoRV32 | rv32im, `-DPICORV_SIM` (no `csrw mtvec`) | `fw/build_pico/` |

## Build (LXC 190, /root/ee5223/de10)

```
source env.sh
FW=selftest scripts/build.sh                 # Nios V/g (default), program baked into RAM: selftest|cnn|lstm
NIOSV_CORE=intel_niosv_m scripts/build.sh    # Nios V/m (fw rv32i automatically)
NPU_RTL_VARIANT=ref scripts/build.sh         # proj/rtl (via rtl_compat) instead of quartus_fit/rtl_fpga
scripts/build_pico.sh                        # licence-free PicoRV32 system -> out/de10_nano_npu_picorv32.sof
```

Each build compiles one firmware into its SOF. To change the program in an existing SOF without re-fitting:
1. Copy the `.hex` to `onchip_init.hex` (PicoRV32: `onchip_init_pico.hex`).
2. Run `quartus_cdb <prj> -c <prj> --update_mif`.
3. Run `quartus_asm <prj> -c <prj>`.

`qsys-script` (Jacl) cannot see shell environment variables, so `build.sh` passes the build options to it through `--cmd="set ..."`.

## PicoRV32 fallback system (no licence needed)

| Part | File |
|---|---|
| CPU wrapper | `ip/picorv32_avmm.sv` + `ip/picorv32_avmm_hw.tcl`: PicoRV32 with the same parameters as the simulation SoC. It bridges native to Avalon-MM with one outstanding transfer and waits for waitrequest and readdatavalid. A 64-bit cycle counter is decoded locally at `0x2002_0000`. |
| Platform Designer system | `scripts/create_system_pico.tcl` creates `system_pico.qsys`. |
| Quartus project | `de10_nano_npu_pico.qpf/.qsf`, with `VERILOG_MACRO USE_PICORV32` selecting the system in `rtl/de10_nano_top.sv`. |

The memory map, JTAG UART and LEDs are the same as in the Nios V systems.

## On the board

See **`BOARD_RUNBOOK.md`** (Vietnamese, 5-minute plan). It contains the commands, the expected outputs, the LED table, the fallback order and the SHA256 checksums.

Quick start:

```
jtagconfig                                   # expect "DE-SoC [USB-1]": SOCVHPS (@1) + 5CSEBA6 (@2)
quartus_pgm -c "DE-SoC [USB-1]" -m JTAG -o "p;out\de10_nano_npu_picorv32_selftest.sof@2"
juart-terminal -c "DE-SoC [USB-1]" -d 2 -i 0  # then press KEY0 to re-run with the terminal attached
niosv-download -g -c "DE-SoC [USB-1]" -d 2 out\cnn_niosvg.elf   # Nios V/g or /m only (debug module)
```

LED meaning:

| LED | Meaning |
|---|---|
| LED0 | Heartbeat |
| LED1 | Running |
| LED2 | Done |
| LED3 | PASS |
| LED4 | FAIL |
| LED5 | Trap |

## Status / what was verified (2026-10-23)

### Whole-system results

All builds use NPU N=8, DEPTH=64. No variant has negative slack in any corner.

| Variant | CPU | NPU RTL | Seed | ALMs | Regs | M10K | DSP | Fmax slow 100C / -40C | Worst setup | Worst hold | Licence warning 24850 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| picorv32 | PicoRV32 rv32im | rtl_fpga | 1 | 3,686 | 4,360 | 284 | 51 | 81.6 / 86.5 MHz | +7.742 ns | +0.014 ns | **no** (no OpenCore IP) |
| niosv_g | Nios V/g rv32im, 16 KB I$ + 16 KB D$ | rtl_fpga | 3 | 6,758 | 8,603 | 319 | 51 | 72.6 / 73.9 MHz | +6.219 ns | +0.013 ns | yes, IP-NIOSVG |
| niosv_m | Nios V/m rv32i | rtl_fpga | 3 | 4,915 | 6,275 | 284 | 48 | 74.7 / 77.8 MHz | +6.605 ns | +0.013 ns | yes, IP-NIOSVM |
| niosv_c | Nios V/c rv32i (no debug module, no timer) | rtl_fpga | 3 | 3,043 | 3,667 | 284 | 48 | 79.5 / 82.5 MHz | +7.416 ns | +0.015 ns | yes, IP-NIOSVC |
| niosv_g_refrtl | Nios V/g | proj/rtl | 1 | 21,322 | 30,789 | 301 | 51 | 52.0 / 50.9 MHz | +0.358 ns | +0.054 ns | yes, IP-NIOSVG |

Notes on the table:
- The NPU alone (rtl_fpga) uses about 2.1k ALMs, 24 M10K and 48 DSP.
- Every fit succeeded, and every assembler run produced a normal SOF with 0 errors.
- Reports are in `reports/<variant>/`. SOF checksums are in `out/SHA256SUMS.txt`.

### SOFs in `out/`

Within each CPU variant the SOFs share the same fit; only the RAM image differs.

| SOF | Preloaded program |
|---|---|
| `de10_nano_npu_{picorv32,niosvg,niosvm}_selftest.sof` | selftest |
| `de10_nano_npu_{picorv32,niosvg,niosvm}_cnn.sof` | cnn |
| `de10_nano_npu_{picorv32,niosvg,niosvm}_lstm.sof` | lstm |
| `de10_nano_npu_niosvc_selftest_only.sof` | selftest |
| `de10_nano_npu_niosvg_refrtl_selftest.sof` | selftest |

Matching ELF and HEX files: `{selftest,cnn,lstm}_{niosvg,niosvm,picorv32}.{elf,hex}`.

### Firmware checks in Verilator (LXC 180)

The final ELFs from `out/` (built by the Nios V gcc 13.2 toolchain) were run on PicoRV32 with the DE10 memory map and the rtl_fpga NPU. Logs are in `sim/logs/build_elf_*`.

| ELF | Testbench | Change to binary | Result |
|---|---|---|---|
| `*_niosvg` (selftest, cnn, lstm) | `tb_de10_map` | `csrw mtvec` patched to NOP, since PicoRV32 lacks it | ALL PASS, cnn 8/8, lstm 16/16 |
| `*_niosvm` (selftest, cnn, lstm) | `tb_de10_map` | same patch | ALL PASS, cnn 8/8 (26 s simulated at 50 MHz) |
| `*_picorv32` (selftest, cnn, lstm) | `tb_pico_avmm` | none | ALL PASS |

Two more checks of the same kind passed:
- The rv32i cnn built from the same sources with the open-source gcc on LXC 180 passed 8/8 (`sim/logs/rv32i_cnn.log`).
- `tb_pico_avmm` uses the real `ip/picorv32_avmm.sv` bridge with random waitrequest and 1–3 cycle read latency.

### Not verified

1. **Nothing has been run on the physical board.**
2. **Nios V licence.** All Nios V variants print `Failed to acquire license ... IP-NIOSV{G,M,C}: Client token expired (401)`, and the map report lists the core as "OpenCore". The SOFs are normal (not `_time_limited`), but whether the core runs on hardware without a licence is unknown.
   - To fix: refresh the Quartus licence login, or install the free Nios V licence from the Intel Self-Service Licensing Center, then rebuild.
   - Because of this risk, the runbook puts **PicoRV32 first**.
3. **No CPU-level Nios V simulation.** Questa FSE `vsim` refuses to start ("SALT_LICENSE_SERVER not set"), and the Nios V RTL is encrypted, so Verilator cannot simulate it.
   - Consequence: the Nios V-specific behaviour is untested. This covers AXI4-Lite to Avalon conversion, caches with the uncached peripheral region, `mtvec`, and the JTAG UART driver against real hardware.
   - The PicoRV32 system needs neither a licence nor encrypted IP. Its Platform Designer interconnect, on-chip RAM and Intel JTAG UART were built by Quartus but were not simulated either.
4. **Nios V/c** has no debug module and no mtime timer. Only selftest can run on it, and `niosv-download` is not possible.
