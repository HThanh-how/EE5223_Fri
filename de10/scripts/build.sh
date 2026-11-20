#!/usr/bin/env bash
# Build firmware, Platform Designer và Quartus cho Nios V; tạo báo cáo và output.
# Từ de10/: FW=selftest scripts/build.sh; FW chọn firmware, NIOSV_CORE chọn CPU.
# Full DE10-Nano build: firmware -> Platform Designer system -> Quartus compile -> reports.
# Run from anywhere:  de10/scripts/build.sh
# Env knobs: FW=selftest|cnn|lstm (program baked into the on-chip RAM, default selftest)
#            NIOSV_CORE=intel_niosv_g|intel_niosv_m   NPU_N=8  NPU_DEPTH=64
#            NPU_RTL_VARIANT=ref|fpga  (read by ip/npu_avmm_hw.tcl)
#            SKIP_FW=1 / SKIP_QSYS=1 to skip those stages
# Lệnh từ gốc repo: FW=selftest NPU_N=8 bash de10/scripts/build.sh.
# Chọn CPU nhỏ: NIOSV_CORE=intel_niosv_m FW=selftest bash de10/scripts/build.sh.
# Chọn RTL gốc: NPU_RTL_VARIANT=ref FW=selftest bash de10/scripts/build.sh.
# Script tự cd de10 rồi source env.sh; output chính out/de10_nano_npu.sof.
# SKIP_FW/SKIP_QSYS được xét rỗng/không rỗng, giá trị 0 vẫn có nghĩa skip.
# Không set -u vì hai biến SKIP có thể chưa khai báo; pipefail bắt lỗi pipeline.
set -eo pipefail
cd "$(dirname "$0")/.."
D=$(pwd)
source ./env.sh
export FW=${FW:-selftest} NPU_N=${NPU_N:-8} NPU_DEPTH=${NPU_DEPTH:-64}
mkdir -p reports out

# Build firmware theo ISA CPU: /m và /c RV32I không có multiply/divide phần cứng.
# /g dùng mục all; chỉ FW được chọn được copy thành onchip_init.hex cho RAM FPGA.
# Firmware ở đây lấy startup/platform DE10 từ Makefile trong de10/fw.
if [ -z "$SKIP_FW" ]; then
  echo "== firmware (N=$NPU_N, RAM init = $FW)"
  case "${NIOSV_CORE:-intel_niosv_g}" in
    intel_niosv_m|intel_niosv_c)   # RV32I only (no M extension)
      make -C fw N=$NPU_N rv32i; cp fw/build_rv32i/$FW.hex onchip_init.hex ;;
    *)
      make -C fw N=$NPU_N all;   cp fw/build/$FW.hex onchip_init.hex ;;
  esac
fi

# Tạo bản rtl_compat cho Quartus Lite trước khi qsys đọc component variant ref.
# Tham số N/DEPTH/CORE được truyền bằng Tcl --cmd vì Jacl không đọc env như shell.
# Log tạo hệ được giữ ở reports/create_system.log, có Error thì dừng.
# qsys-generate sinh system/ từ system.qsys, là input cho Quartus compile sau đó.
if [ -z "$SKIP_QSYS" ]; then
  echo "== Platform Designer (NPU RTL variant: ${NPU_RTL_VARIANT:-fpga, default set in ip/npu_avmm_hw.tcl})"
  python3 scripts/make_compat.py ../rtl rtl_compat
  qsys-script --search-path="ip,\$" --cmd="set NIOSV_CORE ${NIOSV_CORE:-intel_niosv_g}; set NPU_N $NPU_N; set NPU_DEPTH $NPU_DEPTH" --script=scripts/create_system.tcl 2>&1 | tee reports/create_system.log | grep -E "Error|create_system:" || true
  grep -q "Error" reports/create_system.log && { echo "create_system failed"; exit 1; }
  qsys-generate system.qsys --synthesis=VERILOG --output-directory=system \
      --family="Cyclone V" --part=5CSEBA6U23I7 --search-path="ip,\$" > reports/qsys_generate.log 2>&1
  tail -2 reports/qsys_generate.log
fi

# quartus_sh --flow compile chạy synthesis/place-route/timing theo project .qpf/.qsf.
# Compile lỗi in 40 dòng cuối log và exit; không tự nạp .sof lên board.
echo "== Quartus compile"
quartus_sh --flow compile de10_nano_npu > reports/quartus_compile.log 2>&1 || { tail -40 reports/quartus_compile.log; exit 1; }
grep -E "^Info: Quartus Prime Full Compilation was successful" reports/quartus_compile.log || true

# Copy fit/sta/flow report để kiểm resource và timing; awk trích utilization/Fmax.
# Một số cp/grep cho phép thiếu bằng || true; cần đọc report để kết luận timing.
# Bitstream copy vào out là artifact build, chưa là bằng chứng chạy trên DE10 thật.
O=output_files
cp $O/de10_nano_npu.fit.summary $O/de10_nano_npu.sta.summary $O/de10_nano_npu.flow.rpt reports/ 2>/dev/null || true
cp $O/de10_nano_npu.fit.rpt $O/de10_nano_npu.sta.rpt $O/de10_nano_npu.map.rpt reports/ 2>/dev/null || true
# per-entity utilisation (NPU vs CPU vs RAM)
awk '/; Fitter Resource Utilization by Entity/{f=1} f{print} f&&/^$/{n++} n==2{exit}' $O/de10_nano_npu.fit.rpt > reports/utilization_by_entity.txt || true
awk '/Model Fmax Summary/{f=1} f{print} f&&/^$/{f=0}' $O/de10_nano_npu.sta.rpt > reports/fmax.txt || true
grep -E "Worst-case|Slack|slack" $O/de10_nano_npu.sta.summary > reports/timing_summary.txt || true

cp $O/de10_nano_npu.sof out/ 2>/dev/null || true
ls $O/*.sof
echo "== done"
cat $O/de10_nano_npu.fit.summary
