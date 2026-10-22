#!/usr/bin/env bash
# Build everything once, so run_demo.sh only has to simulate.
# Run from anywhere; it works on the enclosing proj checkout.   Usage: demo/prepare.sh [N=8]
set -e
cd "$(dirname "$0")/.."
N=${1:-8}
t0=$(date +%s)
echo "== [1/3] systolic array unit-test binary (Verilator), N=4"
make build_N4/Vsa_top N=4 >/dev/null
echo "== [2/3] SoC testbench (PicoRV32 + NPU), N=$N"
make build_soc_N$N/Vtb_soc N=$N >/dev/null
echo "== [3/3] firmware images: selftest gemm_demo cnn lstm"
for fw in selftest gemm_demo cnn lstm; do
  make build_soc_N$N/$fw.hex N=$N FW=$fw >/dev/null && echo "   built $fw.hex"
done
echo "prepare done in $(( $(date +%s) - t0 )) s"
