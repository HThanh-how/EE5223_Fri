#!/usr/bin/env bash
# Chạy các bước kiểm tra flow nguồn mở; cần toolchain mô phỏng và firmware.
# Chạy: bash scripts/preflight.sh từ gốc repo; xem output từng bước để xác định lỗi.
# Full pre-board verification of the open-source flow. Exit code 0 only if everything passes.
#   scripts/preflight.sh            all checks (about 6-10 minutes)
#   scripts/preflight.sh --quick    skip the N=4 CNN/LSTM runs
# Needs: verilator (>=5), riscv64-unknown-elf-gcc, python3, make, g++.
# Không nhận N/FW riêng: ma trận regression đã cố định N=4 và N=8 trong script.
# --quick chỉ bỏ CNN/LSTM N=4, vẫn chạy unit/GEMM/selftest cả hai N và mạng N=8.
# PREFLIGHT_LOGDIR=tmp_logs bash scripts/preflight.sh --quick đổi thư mục log.
# set -u bắt biến chưa khai báo; không set -e để một test fail vẫn chạy các test sau.
set -u
cd "$(dirname "$0")/.."
QUICK=0; [ "${1:-}" = "--quick" ] && QUICK=1
LOGDIR=${PREFLIGHT_LOGDIR:-preflight_logs}
mkdir -p "$LOGDIR"
# Mỗi check tăng một counter và lưu ROWS; báo cáo cuối in tổng PASS/FAIL/WARN.
# WARN không đổi exit code; chỉ FAIL>0 làm PREFLIGHT: FAILED và exit 1.
PASS=0; FAIL=0; WARN=0
ROWS=()

row() { printf '  %-52s %s\n' "$1" "$2"; ROWS+=("$1|$2"); }
ok()   { PASS=$((PASS+1)); row "$1" "PASS  $2"; }
bad()  { FAIL=$((FAIL+1)); row "$1" "FAIL  $2"; }
warn() { WARN=$((WARN+1)); row "$1" "WARN  $2"; }

# run_check <name> <logfile> <expected-grep> <cmd...>
# Một check chỉ PASS nếu command exit 0 VÀ log chứa regex mong đợi.
# Điều kiện log cần thiết vì testbench SoC có thể $finish mà process vẫn exit 0.
# Gộp stderr vào log để chẩn đoán build, còn stdout tổng chỉ in tên/status/thời gian.
run_check() {
  local name=$1 log=$LOGDIR/$2 pat=$3; shift 3
  local t0=$SECONDS
  if "$@" >"$log" 2>&1 && grep -q -E "$pat" "$log"; then ok "$name" "($((SECONDS-t0)) s)"; else bad "$name" "see $log"; fi
}

echo "== tools"
for t in verilator riscv64-unknown-elf-gcc python3 make g++; do
  if command -v "$t" >/dev/null 2>&1; then ok "tool: $t" "$($t --version 2>&1 | head -1)"; else bad "tool: $t" "missing"; fi
done
[ -f third_party/picorv32/picorv32.v ] && ok "third_party/picorv32" "present" || bad "third_party/picorv32" "missing"

# Sinh LUT vào mktemp ngoài nguồn rồi diff với hai bảng tracked, không ghi đè chúng.
# Sau check xóa riêng thư mục temp đã tạo; lỗi diff được ghi thành FAIL.
echo "== generated files are reproducible"
tmp=$(mktemp -d); mkdir -p "$tmp/rtl" "$tmp/fw"
python3 scripts/gen_lut.py "$tmp" >/dev/null 2>&1
if diff -q "$tmp/rtl/lut_tables.svh" rtl/lut_tables.svh >/dev/null && diff -q "$tmp/fw/lut_tables.h" fw/lut_tables.h >/dev/null; then
  ok "LUT tables (sigmoid/tanh) regenerate identically" ""; else bad "LUT tables regenerate identically" "rtl/fw LUT files differ from gen_lut.py"; fi
rm -rf "$tmp"

echo "== systolic array unit test"
for n in 4 8; do
  run_check "array unit test N=$n (26 tests)" "test_N$n.log" "ALL PASS" make test N=$n
done

echo "== PicoRV32 + Avalon-MM NPU SoC simulation"
for n in 4 8; do
  run_check "gemm_demo N=$n" "gemm_N$n.log" "RESULT: ALL PASS" make soc N=$n FW=gemm_demo
  run_check "selftest (accumulate/requant/LUT) N=$n" "selftest_N$n.log" "RESULT: ALL PASS" make soc N=$n FW=selftest
done
run_check "LeNet-5 INT8, CPU+NPU vs golden, N=8" "cnn_N8.log" "RESULT: ALL PASS" make soc N=8 FW=cnn
run_check "LSTM INT8, CPU+NPU vs golden, N=8" "lstm_N8.log" "RESULT: ALL PASS" make soc N=8 FW=lstm
if [ $QUICK -eq 0 ]; then
  run_check "LeNet-5 INT8, CPU+NPU vs golden, N=4" "cnn_N4.log" "RESULT: ALL PASS" make soc N=4 FW=cnn
  run_check "LSTM INT8, CPU+NPU vs golden, N=4" "lstm_N4.log" "RESULT: ALL PASS" make soc N=4 FW=lstm
fi

# So dòng cycle với results/ là kiểm tái lập, khác biệt chỉ WARN vì tool/RTL có thể đổi.
# Không đánh giá timing board hay Fmax từ kết quả Verilator này.
echo "== cycle counts equal the recorded reference (results/)"
cmp_line() {  # name, new log, reference log, grep pattern
  local a b
  a=$(grep -E "$4" "$2" 2>/dev/null | head -1); b=$(grep -E "$4" "$3" 2>/dev/null | head -1)
  if [ -z "$a" ] || [ -z "$b" ]; then warn "$1" "no data to compare"
  elif [ "$a" = "$b" ]; then ok "$1" "identical"; else warn "$1" "differs from results/ (RTL or firmware changed?)"; fi
}
cmp_line "LeNet-5 cycles N=8 vs results/cnn_N8.log" "$LOGDIR/cnn_N8.log" results/cnn_N8.log "^avg cpu_cyc"
cmp_line "LSTM cycles N=8 vs results/lstm_N8.log" "$LOGDIR/lstm_N8.log" results/lstm_N8.log "^npu batch=16"
if [ $QUICK -eq 0 ]; then
  cmp_line "LeNet-5 cycles N=4 vs results/cnn_N4.log" "$LOGDIR/cnn_N4.log" results/cnn_N4.log "^avg cpu_cyc"
fi

# Bước model có thể ghi lại fw/model_*.h vì gọi quantize.py thật ở gốc repo.
# Nó dùng git diff --quiet chỉ đọc để xem header đổi hay không, không reset/stage.
# Nếu thiếu data/weights hoặc NumPy, chỉ WARN; script không bảo đảm train/model đầy đủ.
# Muốn audit chỉ comments mà giữ generated nguyên vẹn thì không chạy toàn preflight.
echo "== model / golden data"
if [ -f data/mnist.npz ] && [ -f model/lenet_float.npz ]; then
  if python3 scripts/quantize.py >"$LOGDIR/quantize.log" 2>&1 && grep -q "int8 acc" "$LOGDIR/quantize.log" && git diff --quiet -- fw/model_cnn.h fw/model_lstm.h 2>/dev/null; then
    ok "quantize.py regenerates model_*.h unchanged" ""; else warn "quantize.py regenerate" "differs or numpy missing (see $LOGDIR/quantize.log)"; fi
else
  warn "quantize.py regenerate" "skipped (data/mnist.npz not present)"
fi
[ -f fw/model_cnn.h ] && [ -f fw/model_lstm.h ] && ok "model headers present" "" || bad "model headers present" "fw/model_*.h missing"

echo
# PREFLIGHT: OK nghĩa không check nào FAIL; vẫn phải đọc WARN để biết bước bỏ qua.
# Logs từng workload giữ ở LOGDIR để xem RESULT, mismatch và cycle chi tiết.
echo "SUMMARY: $PASS passed, $FAIL failed, $WARN warnings"
if [ $FAIL -eq 0 ]; then echo "PREFLIGHT: OK"; exit 0; else echo "PREFLIGHT: FAILED"; exit 1; fi
