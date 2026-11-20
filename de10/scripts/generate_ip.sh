#!/usr/bin/env bash
# Tạo IP Platform Designer cần thiết trước khi mở project Quartus.
# Từ de10/: bash scripts/generate_ip.sh pico; pico chọn hệ PicoRV32 (hoặc niosv).
# Generate the Platform Designer output that is NOT stored in git (system_pico/, system/synthesis/).
# Needed once after a fresh clone, before opening/compiling the Quartus project in the GUI:
#   cd de10 && bash scripts/generate_ip.sh pico      # for de10_nano_npu_pico.qpf  (PicoRV32, no licence needed)
#   cd de10 && bash scripts/generate_ip.sh niosv     # for de10_nano_npu.qpf       (Nios V)
# Then in Quartus: File > Open Project, Processing > Start Compilation (or quartus_sh --flow compile <project>).
# Prebuilt bitstreams are in the GitHub release, so compiling is optional.
# Lệnh từ gốc repo: bash de10/scripts/generate_ip.sh pico (mặc định cũng là pico).
# Dùng bash de10/scripts/generate_ip.sh niosv cho project Nios V.
# Script tự cd de10/source env.sh, yêu cầu file .qsys tương ứng đã có sẵn.
# Bước này chỉ generate IP, không chạy create_system*.tcl, không build firmware.
set -eo pipefail
cd "$(dirname "$0")/.."
source ./env.sh
which=${1:-pico}
mkdir -p reports
# pico sinh system_pico/, niosv sinh system/; --synthesis=VERILOG chọn HDL output.
# --search-path bổ sung ip/ để tìm npu_avmm và picorv32_avmm tự viết.
# Sau generate mới mở Quartus hoặc chạy quartus_sh --flow compile de10_nano_npu_pico.
# Đối số ngoài pico/niosv in usage và exit 1, không chọn variant ngầm.
case "$which" in
  pico)  qsys-generate system_pico.qsys --synthesis=VERILOG --output-directory=system_pico \
           --family="Cyclone V" --part=5CSEBA6U23I7 --search-path="ip,\$" ;;
  niosv) qsys-generate system.qsys --synthesis=VERILOG --output-directory=system \
           --family="Cyclone V" --part=5CSEBA6U23I7 --search-path="ip,\$" ;;
  *) echo "usage: $0 pico|niosv"; exit 1 ;;
esac
