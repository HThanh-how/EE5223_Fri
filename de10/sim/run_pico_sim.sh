#!/usr/bin/env bash
# Build firmware và mô phỏng bridge PicoRV32 với waitrequest thay đổi.
# Chạy: bash de10/sim/run_pico_sim.sh selftest 8 (firmware, kích thước NPU).
# Verilator check of the PicoRV32 Avalon-MM wrapper (ip/picorv32_avmm.sv) with random waitrequest.
# Usage: [RTL=quartus_fit/rtl_fpga] de10/sim/run_pico_sim.sh [selftest|cnn|lstm] [N]
# Từ gốc: bash de10/sim/run_pico_sim.sh selftest 8.
# Ví dụ khác: RTL=rtl bash de10/sim/run_pico_sim.sh cnn 8.
# Đối số 1 chọn fw/<P>.c, đối số 2 chọn N; mặc định selftest/8.
# RV đổi prefix toolchain, RTL đổi thư mục chứa delay/pe/sa_top/npu_avmm và LUT.
set -eo pipefail
cd "$(dirname "$0")/../.."
P=${1:-selftest}; N=${2:-8}
RTL=${RTL:-quartus_fit/rtl_fpga}
B=de10/sim/build_pico_N${N}_$(basename $RTL)
RV=${RV:-riscv64-unknown-elf}
mkdir -p $B
# Compile RV32IM với startup/link/platform DE10 và model C từ fw/.
# -include platform.h cung cấp map UART/counter DE10, PICORV_SIM chọn nhánh mô phỏng.
# ELF/BIN/fw_<P>.hex ở build_pico_N<N>_<RTL>, tách firmware theo P.
$RV-gcc -march=rv32im_zicsr -mabi=ilp32 -O2 -ffreestanding -nostdlib -fno-builtin -DNN=$N -DPICORV_SIM \
    -include de10/fw/platform.h -Ide10/fw -Ifw -T de10/fw/link.ld -Wl,--gc-sections \
    -o $B/$P.elf de10/fw/crt0.S de10/fw/platform.c fw/$P.c -lgcc
$RV-objcopy -O binary $B/$P.elf $B/$P.bin
python3 scripts/bin2hex.py $B/$P.bin > $B/fw_$P.hex
# tb_pico_avmm kiểm wrapper thật trước slave, gồm waitrequest thay đổi theo testbench.
# Executable chỉ build khi chưa có, không so timestamp; đổi source cần rebuild cache.
# Verilator log giữ trong build dir, lỗi compile in 20 dòng cuối rồi exit.
if [ ! -x $B/Vtb ]; then
  verilator --binary --timing -Wno-fatal -Wno-lint -I$RTL --top-module tb_pico_avmm -GN=$N \
    -Mdir $B/obj third_party/picorv32/picorv32.v de10/ip/picorv32_avmm.sv \
    $RTL/delay.sv $RTL/pe.sv $RTL/sa_top.sv $RTL/npu_avmm.sv de10/sim/tb_pico_avmm.sv -o ../Vtb > $B/verilator.log 2>&1 || { tail -20 $B/verilator.log; exit 1; }
fi
# Copy ảnh đã chọn thành fw.hex rồi chạy; log <P>.log chứa stdout firmware/testbench.
# tee không tự xác nhận RESULT: ALL PASS, cần kiểm dòng này khi đánh giá regression.
cd $B && cp fw_$P.hex fw.hex && ./Vtb | tee $P.log
