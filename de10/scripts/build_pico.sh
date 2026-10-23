#!/usr/bin/env bash
# Licence-free fallback build: PicoRV32 + NPU (rtl_fpga by default) -> de10_nano_npu_pico.sof
# Env: FW=selftest|cnn|lstm (RAM init), NPU_RTL_VARIANT=fpga|ref, SKIP_FW=1, SKIP_QSYS=1
set -eo pipefail
cd "$(dirname "$0")/.."
source ./env.sh
export FW=${FW:-selftest} NPU_N=${NPU_N:-8} NPU_DEPTH=${NPU_DEPTH:-64}
P=de10_nano_npu_pico; R=reports/pico
mkdir -p $R out
if [ -z "$SKIP_FW" ]; then
  make -C fw N=$NPU_N pico
  cp fw/build_pico/$FW.hex onchip_init_pico.hex
fi
if [ -z "$SKIP_QSYS" ]; then
  [ "${NPU_RTL_VARIANT:-fpga}" = ref ] && python3 scripts/make_compat.py ../rtl rtl_compat
  qsys-script --search-path="ip,\$" --cmd="set NPU_N $NPU_N; set NPU_DEPTH $NPU_DEPTH" --script=scripts/create_system_pico.tcl > $R/create_system.log 2>&1
  grep -q "Error" $R/create_system.log && { grep Error $R/create_system.log; exit 1; }
  qsys-generate system_pico.qsys --synthesis=VERILOG --output-directory=system_pico \
      --family="Cyclone V" --part=5CSEBA6U23I7 --search-path="ip,\$" > $R/qsys_generate.log 2>&1
  tail -2 $R/qsys_generate.log
fi
quartus_sh --flow compile $P > $R/quartus_compile.log 2>&1 || { grep -E "^Error" $R/quartus_compile.log | head; exit 1; }
O=output_files
cp $O/$P.fit.summary $O/$P.sta.summary $O/$P.flow.rpt $O/$P.fit.rpt $O/$P.sta.rpt $O/$P.map.rpt $R/
awk '/; Fitter Resource Utilization by Entity/{f=1} f{print} f&&/^$/{n++} n==2{exit}' $O/$P.fit.rpt > $R/utilization_by_entity.txt
awk '/Model Fmax Summary/{f=1} f{print} f&&/^$/{f=0}' $O/$P.sta.rpt > $R/fmax.txt
grep -E "Type|Slack" $O/$P.sta.summary > $R/timing_summary.txt
cp $O/$P.sof out/de10_nano_npu_picorv32.sof
for p in selftest cnn lstm; do cp fw/build_pico/$p.elf out/${p}_picorv32.elf; cp fw/build_pico/$p.hex out/${p}_picorv32.hex; done
echo "== done"; cat $O/$P.fit.summary
