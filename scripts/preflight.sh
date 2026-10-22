#!/usr/bin/env bash
# Full pre-board verification of the open-source flow. Exit code 0 only if everything passes.
#   scripts/preflight.sh            all checks (about 6-10 minutes)
#   scripts/preflight.sh --quick    skip the N=4 CNN/LSTM runs
# Needs: verilator (>=5), riscv64-unknown-elf-gcc, python3, make, g++.
set -u
cd "$(dirname "$0")/.."
QUICK=0; [ "${1:-}" = "--quick" ] && QUICK=1
LOGDIR=${PREFLIGHT_LOGDIR:-preflight_logs}
mkdir -p "$LOGDIR"
PASS=0; FAIL=0; WARN=0
ROWS=()

row() { printf '  %-52s %s\n' "$1" "$2"; ROWS+=("$1|$2"); }
ok()   { PASS=$((PASS+1)); row "$1" "PASS  $2"; }
bad()  { FAIL=$((FAIL+1)); row "$1" "FAIL  $2"; }
warn() { WARN=$((WARN+1)); row "$1" "WARN  $2"; }

# run_check <name> <logfile> <expected-grep> <cmd...>
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

echo "== model / golden data"
if [ -f data/mnist.npz ] && [ -f model/lenet_float.npz ]; then
  if python3 scripts/quantize.py >"$LOGDIR/quantize.log" 2>&1 && grep -q "int8 acc" "$LOGDIR/quantize.log" && git diff --quiet -- fw/model_cnn.h fw/model_lstm.h 2>/dev/null; then
    ok "quantize.py regenerates model_*.h unchanged" ""; else warn "quantize.py regenerate" "differs or numpy missing (see $LOGDIR/quantize.log)"; fi
else
  warn "quantize.py regenerate" "skipped (data/mnist.npz not present)"
fi
[ -f fw/model_cnn.h ] && [ -f fw/model_lstm.h ] && ok "model headers present" "" || bad "model headers present" "fw/model_*.h missing"

echo
echo "SUMMARY: $PASS passed, $FAIL failed, $WARN warnings"
if [ $FAIL -eq 0 ]; then echo "PREFLIGHT: OK"; exit 0; else echo "PREFLIGHT: FAILED"; exit 1; fi
