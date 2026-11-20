#!/usr/bin/env bash
# Mô phỏng ELF cuối với memory map DE10; patch CSR mtvec khi PicoRV32 không hỗ trợ.
# Chạy: bash de10/sim/run_elf.sh de10/out/selftest_picorv32.elf (đối số là ELF).
# Run a FINAL firmware ELF from de10/out (built by the Nios V toolchain) on the open-source
# DE10-memory-map testbench. The only change to the binary: `csrw mtvec,t0` (0x30529073, not
# implemented by PicoRV32) is replaced by a NOP in the RAM image. PicoRV32 ELFs have no CSR writes.
# Usage: de10/sim/run_elf.sh <elf> [tb_de10_map|tb_pico_avmm] [RTL dir]
# Từ gốc: bash de10/sim/run_elf.sh de10/out/selftest_picorv32.elf.
# Chọn bridge: bash de10/sim/run_elf.sh de10/out/selftest_picorv32.elf tb_pico_avmm.
# Đối số 3 là thư mục RTL, mặc định quartus_fit/rtl_fpga; N cố định 8.
# ELF đầu vào phải build cho memory map DE10 và N=8, không dùng ELF SoC mặc định.
set -eo pipefail
cd "$(dirname "$0")/../.."
ELF=$1; TB=${2:-tb_de10_map}; RTL=${3:-quartus_fit/rtl_fpga}; N=8
B=de10/sim/build_elf_${TB}_$(basename $RTL); mkdir -p $B
name=$(basename $ELF .elf)
# Chuyển ELF có sẵn, không compile lại C; file ELF gốc được giữ nguyên.
# Patch chỉ vào binary trong build dir, sau đó bin2hex tạo ảnh RAM cho testbench.
riscv64-unknown-elf-objcopy -O binary $ELF $B/$name.bin
# Python quét word little-endian căn 4, thay mẫu opcode csrw mtvec,t0 bằng NOP.
# Đây là thay theo bit pattern, không phân biệt code/data; chỉ dùng với ELF đã biết.
# Log số word patched giúp nhận ra bản Pico không cần patch (thường là 0).
python3 - $B/$name.bin <<'PY'
import sys,struct
p=sys.argv[1]; b=bytearray(open(p,'rb').read()); n=0
for i in range(0,len(b)-3,4):
    if struct.unpack_from('<I',b,i)[0]==0x30529073: struct.pack_into('<I',b,i,0x00000013); n+=1
open(p,'wb').write(b); print("patched csrw mtvec ->nop:",n)
PY
python3 scripts/bin2hex.py $B/$name.bin > $B/fw_$name.hex
# Simulator cache theo tên TB và basename RTL; không tự rebuild nếu source mới hơn.
# Khi đổi RTL cần loại build cache tương ứng trước chạy để không dùng executable cũ.
# tb_pico_avmm thêm wrapper thật; tb_de10_map dùng testbench map DE10 trực tiếp.
if [ ! -x $B/Vtb ]; then
  EXTRA=""; [ $TB = tb_pico_avmm ] && EXTRA=de10/ip/picorv32_avmm.sv
  verilator --binary --timing -Wno-fatal -Wno-lint -I$RTL --top-module $TB -GN=$N -Mdir $B/obj \
    third_party/picorv32/picorv32.v $EXTRA $RTL/delay.sv $RTL/pe.sv $RTL/sa_top.sv $RTL/npu_avmm.sv \
    de10/sim/$TB.sv -o ../Vtb > $B/verilator.log 2>&1
fi
# Mỗi ELF chạy trong run_<name>, copy ảnh thành fw.hex theo tên testbench yêu cầu.
# Log cuối ở build_elf_<TB>_<RTL>/<name>.log, gồm RESULT từ firmware.
mkdir -p $B/run_$name && cd $B/run_$name && cp ../fw_$name.hex fw.hex && ../Vtb | tee ../$name.log
