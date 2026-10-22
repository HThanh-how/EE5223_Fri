#!/usr/bin/env python3
"""Make a Quartus-Lite-compatible copy of delay.sv / sa_top.sv.
Quartus Lite only accepts SV-2005: module-level generate if/for need an explicit generate..endgenerate and
genvars must be declared outside the for header.  Pure syntax wrapping, no semantic change.
usage: make_compat.py <src_rtl_dir> <dst_dir>   (only needed for the ORIGINAL rtl; rtl_fpga is already compatible)"""
import sys, shutil, os, re

src, dst = sys.argv[1:3]
os.makedirs(dst, exist_ok=True)
for f in os.listdir(src):
    if os.path.isfile(os.path.join(src, f)):
        shutil.copy(os.path.join(src, f), dst)

p = os.path.join(dst, 'delay.sv')
s = open(p).read()
s = s.replace("    if (D == 0) begin : g_wire", "    generate\n    if (D == 0) begin : g_wire")
s = s.replace("    end\nendmodule", "    end\n    endgenerate\nendmodule")
open(p, 'w').write(s)

p = os.path.join(dst, 'sa_top.sv')
s = open(p).read()
s = s.replace("    // input skew: row i delayed by i cycles\n",
              "    genvar i, j;\n    generate\n    // input skew: row i delayed by i cycles\n")
s = s.replace("endmodule", "    endgenerate\nendmodule")
s = re.sub(r"for \(genvar (\w+) =", r"for (\1 =", s)
open(p, 'w').write(s)
