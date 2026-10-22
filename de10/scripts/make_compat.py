#!/usr/bin/env python3
"""Quartus-Lite (SV-2005) compatible copy of the reference RTL (proj/rtl -> de10/rtl_compat).
Quartus Standard/Lite needs explicit generate..endgenerate around module-level generate if/for
and genvars declared outside the for header. Pure syntax wrapping, no semantic change
(same transform as quartus_fit/scripts/make_compat.py). proj/rtl itself is NOT modified.
usage: make_compat.py <src_rtl_dir> <dst_dir>"""
import sys, shutil, os, re

src, dst = sys.argv[1:3]
os.makedirs(dst, exist_ok=True)
for f in ("delay.sv", "pe.sv", "sa_top.sv", "npu_avmm.sv", "lut_tables.svh"):
    shutil.copy(os.path.join(src, f), dst)

p = os.path.join(dst, "delay.sv")
s = open(p).read()
if "endgenerate" not in s:
    s = s.replace("    if (D == 0) begin : g_wire", "    generate\n    if (D == 0) begin : g_wire")
    s = s.replace("    end\nendmodule", "    end\n    endgenerate\nendmodule")
open(p, "w").write(s)

p = os.path.join(dst, "sa_top.sv")
s = open(p).read()
if "endgenerate" not in s:
    s = s.replace("    // input skew: row i delayed by i cycles\n",
                  "    genvar i, j;\n    generate\n    // input skew: row i delayed by i cycles\n")
    s = s.replace("endmodule", "    endgenerate\nendmodule")
    s = re.sub(r"for \(genvar (\w+) =", r"for (\1 =", s)
open(p, "w").write(s)
for f in ("delay.sv", "sa_top.sv"):
    assert "generate" in open(os.path.join(dst, f)).read(), f
print("make_compat: %s -> %s" % (src, dst))
