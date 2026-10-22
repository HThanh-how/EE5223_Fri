#!/usr/bin/env bash
# viz/wasm/build.sh - verilate viz_top (wraps our sa_top) and compile it to WASM.
# Usage:  bash wasm/build.sh [N]        (default N=4, N must be a multiple of 4, <= 8)
# Needs:  verilator >= 5, emscripten (emcc/em++) on PATH.
# Env:    NPU_RTL=<dir with delay.sv pe.sv sa_top.sv>  (default: ../rtl, the project RTL)
# Output: web/public/npu_viz.mjs, web/public/npu_viz.wasm
# Also builds + runs a native Verilator self-check (wasm/viz_native_test.cpp) first.
set -euo pipefail
N="${1:-4}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIZ="$(cd "$HERE/.." && pwd)"
RTL_DIR="${NPU_RTL:-$VIZ/../rtl}"
SRC="$RTL_DIR/delay.sv $RTL_DIR/pe.sv $RTL_DIR/sa_top.sv $VIZ/rtl/viz_top.sv"
OBJ="$HERE/obj_dir_N$N"; NAT="$HERE/native_N$N"
OUT="$VIZ/web/public"
VROOT="$(verilator --getenv VERILATOR_ROOT)"

echo "[1/3] verilate (N=$N)"
rm -rf "$OBJ"
verilator --cc $SRC --top-module viz_top -GN=$N --Mdir "$OBJ" \
  -Wall -Wno-DECLFILENAME -Wno-UNUSEDSIGNAL

echo "[2/3] native self-check against GEMM golden"
rm -rf "$NAT"
verilator --cc --exe --build $SRC "$HERE/viz_native_test.cpp" --top-module viz_top -GN=$N \
  -CFLAGS "-DVIZ_N=$N -I$HERE" -Wall -Wno-DECLFILENAME -Wno-UNUSEDSIGNAL \
  --Mdir "$NAT" -o viz_native_test >/dev/null
"$NAT/viz_native_test"

echo "[3/3] emscripten -> WASM"
mkdir -p "$OUT"
VSRCS=$(find "$OBJ" -maxdepth 1 -name 'V*.cpp' | sort)
# shellcheck disable=SC2086
em++ -O3 -std=c++17 -DVIZ_N=$N -DVL_IGNORE_UNKNOWN_ARCH \
  -I "$OBJ" -I "$HERE" -I "$VROOT/include" -I "$VROOT/include/vltstd" \
  "$HERE/bindings.cpp" $VSRCS \
  "$VROOT/include/verilated.cpp" "$VROOT/include/verilated_threads.cpp" \
  -lembind -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=createNpuViz \
  -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT='web,node' \
  -o "$OUT/npu_viz.mjs"
ls -l "$OUT"/npu_viz.*
