#!/usr/bin/env bash
# Build firmware và mô phỏng memory map DE10 bằng PicoRV32 và Verilator.
# Chạy: bash de10/sim/run_sim.sh selftest 8 (firmware, kích thước NPU).
# Open-source (Verilator + riscv gcc) check of the de10 firmware on the DE10 memory map.
# Needs proj/ layout (rtl/, fw/, third_party/picorv32, scripts/bin2hex.py) next to de10/.
# Usage: [RVARCH=-march=rv32i_zicsr] [RTL=quartus_fit/rtl_fpga] de10/sim/run_sim.sh [selftest|cnn|lstm] [N]
# Từ gốc: bash de10/sim/run_sim.sh selftest 8; mặc định cũng selftest/8.
# Chọn FPGA RTL: RTL=quartus_fit/rtl_fpga bash de10/sim/run_sim.sh cnn 8.
# Kiểm RV32I: RVARCH=-march=rv32i_zicsr bash de10/sim/run_sim.sh selftest 8.
# Mục tiêu kiểm firmware trên map DE10, vẫn dùng PicoRV32 trong simulator.
set -eo pipefail
cd "$(dirname "$0")/../.."
P=${1:-selftest}; N=${2:-8}
RTL=${RTL:-rtl}                      # RTL=quartus_fit/rtl_fpga for the FPGA variant
B=de10/sim/build_N${N}_$(basename $RTL)${RVARCH:+_rv32i}
RV=${RV:-riscv64-unknown-elf}
mkdir -p $B
# N mặc định 8 truyền đồng thời vào -DNN firmware và -GN testbench.
# Platform/startup/link lấy từ de10/fw, không lấy fw/start.S của SoC map 0x10000000.
# RVARCH có giá trị thì build dir thêm _rv32i; default bật M extension.
$RV-gcc ${RVARCH:--march=rv32im_zicsr} -mabi=ilp32 -O2 -ffreestanding -nostdlib -fno-builtin -DNN=$N -DPICORV_SIM \
    -include de10/fw/platform.h -Ide10/fw -Ifw -T de10/fw/link.ld -Wl,--gc-sections \
    -o $B/$P.elf de10/fw/crt0.S de10/fw/platform.c fw/$P.c -lgcc
# size in section footprint; objcopy tạo binary rồi bin2hex xuất word RAM little-endian.
# fw_<P>.hex tách theo chương trình, simulator chung cho cùng N/RTL/ISA suffix.
$RV-size $B/$P.elf
$RV-objcopy -O binary $B/$P.elf $B/$P.bin
python3 scripts/bin2hex.py $B/$P.bin > $B/fw_$P.hex
# tb_de10_map nối CPU/NPU theo địa chỉ DE10, không dùng picorv32_avmm wrapper thật.
# Muốn kiểm bridge Avalon thật và stall, dùng run_pico_sim.sh.
# Cache chỉ xét executable tồn tại; source đổi không tự kích rebuild tại đây.
if [ ! -x $B/Vtb ]; then
  verilator --binary --timing -Wno-fatal -Wno-lint -I$RTL --top-module tb_de10_map -GN=$N \
    -Mdir $B/obj third_party/picorv32/picorv32.v $RTL/delay.sv $RTL/pe.sv $RTL/sa_top.sv $RTL/npu_avmm.sv \
    de10/sim/tb_de10_map.sv -o ../Vtb > $B/verilator.log 2>&1
fi
# Chạy trong build dir để $readmemh thấy fw.hex; stdout lưu <P>.log.
# Compile thành công chưa đủ PASS; xem mismatch, RESULT và trap/timeout trong log.
cd $B && cp fw_$P.hex fw.hex && ./Vtb | tee $P.log
