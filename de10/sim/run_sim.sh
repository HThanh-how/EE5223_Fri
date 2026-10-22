#!/usr/bin/env bash
# Open-source (Verilator + riscv gcc) check of the de10 firmware on the DE10 memory map.
# Needs proj/ layout (rtl/, fw/, third_party/picorv32, scripts/bin2hex.py) next to de10/.
# Usage: de10/sim/run_sim.sh [selftest|cnn|lstm] [N]
set -eo pipefail
cd "$(dirname "$0")/../.."
P=${1:-selftest}; N=${2:-8}; B=de10/sim/build_N$N
RV=${RV:-riscv64-unknown-elf}
mkdir -p $B
$RV-gcc -march=rv32im_zicsr -mabi=ilp32 -O2 -ffreestanding -nostdlib -fno-builtin -DNN=$N -DPICORV_SIM \
    -include de10/fw/platform.h -Ide10/fw -Ifw -T de10/fw/link.ld -Wl,--gc-sections \
    -o $B/$P.elf de10/fw/crt0.S de10/fw/platform.c fw/$P.c -lgcc
$RV-size $B/$P.elf
$RV-objcopy -O binary $B/$P.elf $B/$P.bin
python3 scripts/bin2hex.py $B/$P.bin > $B/fw_$P.hex
if [ ! -x $B/Vtb ]; then
  verilator --binary --timing -Wno-fatal -Wno-lint -Irtl --top-module tb_de10_map -GN=$N \
    -Mdir $B/obj third_party/picorv32/picorv32.v rtl/delay.sv rtl/pe.sv rtl/sa_top.sv rtl/npu_avmm.sv \
    de10/sim/tb_de10_map.sv -o ../Vtb > $B/verilator.log 2>&1
fi
cd $B && cp fw_$P.hex fw.hex && ./Vtb | tee $P.log
