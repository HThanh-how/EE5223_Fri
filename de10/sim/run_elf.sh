#!/usr/bin/env bash
# Run a FINAL firmware ELF from de10/out (built by the Nios V toolchain) on the open-source
# DE10-memory-map testbench. The only change to the binary: `csrw mtvec,t0` (0x30529073, not
# implemented by PicoRV32) is replaced by a NOP in the RAM image. PicoRV32 ELFs have no CSR writes.
# Usage: de10/sim/run_elf.sh <elf> [tb_de10_map|tb_pico_avmm] [RTL dir]
set -eo pipefail
cd "$(dirname "$0")/../.."
ELF=$1; TB=${2:-tb_de10_map}; RTL=${3:-quartus_fit/rtl_fpga}; N=8
B=de10/sim/build_elf_${TB}_$(basename $RTL); mkdir -p $B
name=$(basename $ELF .elf)
riscv64-unknown-elf-objcopy -O binary $ELF $B/$name.bin
python3 - $B/$name.bin <<'PY'
import sys,struct
p=sys.argv[1]; b=bytearray(open(p,'rb').read()); n=0
for i in range(0,len(b)-3,4):
    if struct.unpack_from('<I',b,i)[0]==0x30529073: struct.pack_into('<I',b,i,0x00000013); n+=1
open(p,'wb').write(b); print("patched csrw mtvec ->nop:",n)
PY
python3 scripts/bin2hex.py $B/$name.bin > $B/fw_$name.hex
if [ ! -x $B/Vtb ]; then
  EXTRA=""; [ $TB = tb_pico_avmm ] && EXTRA=de10/ip/picorv32_avmm.sv
  verilator --binary --timing -Wno-fatal -Wno-lint -I$RTL --top-module $TB -GN=$N -Mdir $B/obj \
    third_party/picorv32/picorv32.v $EXTRA $RTL/delay.sv $RTL/pe.sv $RTL/sa_top.sv $RTL/npu_avmm.sv \
    de10/sim/$TB.sv -o ../Vtb > $B/verilator.log 2>&1
fi
mkdir -p $B/run_$name && cd $B/run_$name && cp ../fw_$name.hex fw.hex && ../Vtb | tee ../$name.log
