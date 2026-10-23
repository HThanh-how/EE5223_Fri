#!/usr/bin/env bash
# Generate the Platform Designer output that is NOT stored in git (system_pico/, system/synthesis/).
# Needed once after a fresh clone, before opening/compiling the Quartus project in the GUI:
#   cd de10 && bash scripts/generate_ip.sh pico      # for de10_nano_npu_pico.qpf  (PicoRV32, no licence needed)
#   cd de10 && bash scripts/generate_ip.sh niosv     # for de10_nano_npu.qpf       (Nios V)
# Then in Quartus: File > Open Project, Processing > Start Compilation (or quartus_sh --flow compile <project>).
# Prebuilt bitstreams are in the GitHub release, so compiling is optional.
set -eo pipefail
cd "$(dirname "$0")/.."
source ./env.sh
which=${1:-pico}
mkdir -p reports
case "$which" in
  pico)  qsys-generate system_pico.qsys --synthesis=VERILOG --output-directory=system_pico \
           --family="Cyclone V" --part=5CSEBA6U23I7 --search-path="ip,\$" ;;
  niosv) qsys-generate system.qsys --synthesis=VERILOG --output-directory=system \
           --family="Cyclone V" --part=5CSEBA6U23I7 --search-path="ip,\$" ;;
  *) echo "usage: $0 pico|niosv"; exit 1 ;;
esac
