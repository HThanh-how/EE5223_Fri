#!/usr/bin/env bash
# One-command live demo: INT8 systolic-array NPU + PicoRV32 (Verilator, open-source flow).
#
#   demo/run_demo.sh                 run all 5 stages back-to-back
#   demo/run_demo.sh --pause         wait for ENTER between stages (for narration)
#   demo/run_demo.sh --only 4        run a single stage (1..5); may repeat: --only 1 --only 4
#   demo/run_demo.sh --quick         CNN stage stops after 3 images (~45 s instead of ~2 min)
#   demo/run_demo.sh --save DIR      also store plain-text output of every stage in DIR
#   demo/run_demo.sh --n 4           use NPU size N=4 (needs `demo/prepare.sh 4` first)
#
# Run `demo/prepare.sh` once beforehand (builds all binaries). Works from any cwd.
set -u
cd "$(dirname "$0")/.."            # proj root
PAUSE=0; QUICK=0; N=8; SAVE=""; ONLY=()
while [ $# -gt 0 ]; do
  case "$1" in
    --pause) PAUSE=1;; --quick) QUICK=1;; --n) N=$2; shift;; --save) SAVE=$2; shift;;
    --only) ONLY+=("$2"); shift;; -h|--help) sed -n '2,12p' "$0"; exit 0;;
    *) echo "unknown option $1"; exit 1;;
  esac; shift
done
[ -n "$SAVE" ] && mkdir -p "$SAVE"
BD=build_soc_N$N
for f in build_N4/Vsa_top $BD/Vtb_soc $BD/cnn.hex $BD/lstm.hex $BD/gemm_demo.hex $BD/selftest.hex; do
  [ -e "$f" ] || { echo "missing $f - run demo/prepare.sh $N first"; exit 1; }
done
export FORCE_COLOR=1
B=$'\033[1m'; Z=$'\033[0m'; CY=$'\033[1;36m'; YL=$'\033[1;33m'; GR=$'\033[1;32m'; DM=$'\033[2m'
strip() { sed -u 's/\x1b\[[0-9;]*m//g'; }
want() { [ ${#ONLY[@]} -eq 0 ] && return 0; for s in "${ONLY[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }

banner() {  # $1 stage no, $2 title, $3 expected time, $4 command shown
  echo; echo "${CY}================================================================================${Z}"
  echo "${CY}  STAGE $1/5  |  $2${Z}"
  echo "${CY}================================================================================${Z}"
  echo "${YL}  expected run time : $3${Z}"
  echo "${YL}  command           : \$ $4${Z}"; echo
}
stage() {   # $1 no, $2 title, $3 time, $4 cmd text, $5 name, remaining: pipeline function name
  want "$1" || return 0
  if [ $PAUSE = 1 ]; then read -r -p "${B}[Enter] to start stage $1 - $2 ${Z}" _; fi
  banner "$1" "$2" "$3" "$4"
  local t0=$SECONDS
  if [ -n "$SAVE" ]; then
    { echo "# STAGE $1: $2"; echo "# command: $4"; } > "$SAVE/stage$1_$5.txt"
    $6 2>&1 | tee >(strip >> "$SAVE/stage$1_$5.txt")
  else $6 2>&1; fi
  echo; echo "${GR}  [stage $1 finished in $((SECONDS - t0)) s]${Z}"
}
simrun() { stdbuf -oL make soc N=$N FW=$1 | grep --line-buffered -v '^- '; }

s1() { make test N=4 | grep --line-buffered -E 'PASS|FAIL|tests'; }
s2() { simrun gemm_demo; echo; echo "${DM}  (M = rows of A; cpu_cycles = scalar PicoRV32 matmul, npu_total = incl. host copies, npu_compute = systolic busy cycles)${Z}"; }
s3() { simrun selftest; }
s4() {
  echo "${DM}  First test image, as the firmware will see it (28x28 pixels):${Z}"; python3 demo/ascii_mnist.py show 0
  echo "${DM}  The firmware classifies 8 MNIST digits, each twice (CPU-only, then CPU+NPU); every image is drawn when its result arrives.${Z}"
  if [ $QUICK = 1 ]; then simrun cnn | python3 demo/ascii_mnist.py filter --skip-art 0 | sed -u '/^img 2 /q'
  else simrun cnn | python3 demo/ascii_mnist.py filter --skip-art 0; fi
}
s5() {
  simrun lstm | tee /tmp/.lstm_demo.$$
  awk '/speedup_x100/ { split($4,a,"="); split($5,b,"="); printf "\n  >>> batch=1 : %.2fx vs CPU     batch=16 : %.2fx vs CPU  (NPU rows are filled only when images are batched)\n", a[2]/100, b[2]/100 }' /tmp/.lstm_demo.$$
  rm -f /tmp/.lstm_demo.$$
}

echo "${B}INT8 systolic-array NPU in a RISC-V SoC  -  live demo (N=$N)${Z}"
echo "${DM}Toolchain: Verilator (RTL sim) + riscv64 gcc + PicoRV32 - no proprietary tools${Z}"
T0=$SECONDS
stage 1 "Systolic array unit test (RTL vs golden model)" "< 1 s" "make test N=4" unit s1
stage 2 "PicoRV32 + NPU: GEMM demo over Avalon-MM" "~1 s" "make soc N=$N FW=gemm_demo" gemm s2
stage 3 "Post-processing self-test (bias, requant, ReLU/sigmoid/tanh LUT)" "~8 s" "make soc N=$N FW=selftest" selftest s3
stage 4 "LeNet-5 INT8 on MNIST: CPU-only vs NPU" "~2 min (8 images; --quick: ~45 s)" "make soc N=$N FW=cnn" cnn s4
stage 5 "LSTM INT8: batch=1 vs batch=16" "~30 s" "make soc N=$N FW=lstm" lstm s5
echo; echo "${GR}Demo complete in $((SECONDS - T0)) s.${Z}"
