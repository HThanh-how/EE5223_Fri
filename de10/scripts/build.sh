#!/usr/bin/env bash
# Full DE10-Nano build: firmware -> Platform Designer system -> Quartus compile -> reports.
# Run from anywhere:  de10/scripts/build.sh
# Env knobs: FW=selftest|cnn|lstm (program baked into the on-chip RAM, default selftest)
#            NIOSV_CORE=intel_niosv_g|intel_niosv_m   NPU_N=8  NPU_DEPTH=64
#            NPU_RTL_VARIANT=ref|fpga  (read by ip/npu_avmm_hw.tcl)
#            SKIP_FW=1 / SKIP_QSYS=1 to skip those stages
set -eo pipefail
cd "$(dirname "$0")/.."
D=$(pwd)
source ./env.sh
export FW=${FW:-selftest} NPU_N=${NPU_N:-8} NPU_DEPTH=${NPU_DEPTH:-64}
mkdir -p reports out

if [ -z "$SKIP_FW" ]; then
  echo "== firmware (N=$NPU_N, RAM init = $FW)"
  make -C fw N=$NPU_N all
  cp fw/build/$FW.hex onchip_init.hex
fi

if [ -z "$SKIP_QSYS" ]; then
  echo "== Platform Designer (NPU RTL variant: ${NPU_RTL_VARIANT:-fpga, default set in ip/npu_avmm_hw.tcl})"
  python3 scripts/make_compat.py ../rtl rtl_compat
  qsys-script --search-path="ip,\$" --script=scripts/create_system.tcl | tee reports/create_system.log | grep -E "Error|create_system:" || true
  grep -q "Error" reports/create_system.log && { echo "create_system failed"; exit 1; }
  qsys-generate system.qsys --synthesis=VERILOG --output-directory=system \
      --family="Cyclone V" --part=5CSEBA6U23I7 --search-path="ip,\$" > reports/qsys_generate.log 2>&1
  tail -2 reports/qsys_generate.log
fi

echo "== Quartus compile"
quartus_sh --flow compile de10_nano_npu > reports/quartus_compile.log 2>&1 || { tail -40 reports/quartus_compile.log; exit 1; }
grep -E "^Info: Quartus Prime Full Compilation was successful" reports/quartus_compile.log || true

O=output_files
cp $O/de10_nano_npu.fit.summary $O/de10_nano_npu.sta.summary $O/de10_nano_npu.flow.rpt reports/ 2>/dev/null || true
cp $O/de10_nano_npu.fit.rpt $O/de10_nano_npu.sta.rpt $O/de10_nano_npu.map.rpt reports/ 2>/dev/null || true
# per-entity utilisation (NPU vs CPU vs RAM)
awk '/; Fitter Resource Utilization by Entity/{f=1} f{print} f&&/^$/{n++} n==2{exit}' $O/de10_nano_npu.fit.rpt > reports/utilization_by_entity.txt || true
awk '/Model Fmax Summary/{f=1} f{print} f&&/^$/{f=0}' $O/de10_nano_npu.sta.rpt > reports/fmax.txt || true
grep -E "Worst-case|Slack|slack" $O/de10_nano_npu.sta.summary > reports/timing_summary.txt || true

cp $O/de10_nano_npu.sof out/ 2>/dev/null || true
ls $O/*.sof
cp fw/build/*.elf fw/build/*.hex out/
echo "== done"
cat $O/de10_nano_npu.fit.summary
