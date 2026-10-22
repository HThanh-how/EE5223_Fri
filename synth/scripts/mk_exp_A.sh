#!/bin/bash
# Creates $WORK/expA/: private copy of rtl with cmem/qmem writes moved out of the async-reset always_ff
# (so yosys keeps them as memories instead of flattening them to flip-flops). Does NOT touch shared RTL.
WORK=${WORK:-/root/work_synth}
rm -rf $WORK/expA; mkdir $WORK/expA; cp $WORK/rtl/* $WORK/expA/
python3 - "$WORK/expA/npu_avmm.sv" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace("                    cmem[recv[AW-1:0]] <= sum_row;\n","")
s=s.replace("                    qmem[arow[AW-1:0]] <= q_row_data;\n","")
s=s.replace("    // ---------------- read path (latency 1)","""    always_ff @(posedge clk) begin
        if (busy && out_valid) cmem[recv[AW-1:0]] <= sum_row;
        if (busy && va)        qmem[arow[AW-1:0]] <= q_row_data;
    end
    // ---------------- read path (latency 1)""")
open(p,'w').write(s)
PY
