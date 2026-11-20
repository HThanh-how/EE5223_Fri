#!/usr/bin/env python3
# Tạo bản sao RTL với generate tường minh cho Quartus Lite; không sửa nguồn gốc.
# Chạy: python3 de10/scripts/make_compat.py rtl de10/rtl_compat (nguồn, đích).
"""Quartus-Lite (SV-2005) compatible copy of the reference RTL (proj/rtl -> de10/rtl_compat).
Quartus Standard/Lite needs explicit generate..endgenerate around module-level generate if/for
and genvars declared outside the for header. Pure syntax wrapping, no semantic change
(same transform as quartus_fit/scripts/make_compat.py). proj/rtl itself is NOT modified.
usage: make_compat.py <src_rtl_dir> <dst_dir>"""
# CLI có hai đối số bắt buộc: source RTL dir và destination dir.
# Ví dụ từ gốc: python3 de10/scripts/make_compat.py rtl de10/rtl_compat.
# Copy năm file (kể cả LUT) rồi chỉ sửa delay.sv và sa_top.sv ở destination.
# Không chạy với source=destination vì bản copy chỉ dành cho Quartus Lite.
# Đây là biến đổi text theo marker, không phải parser SystemVerilog tổng quát.
import sys, shutil, os, re

src, dst = sys.argv[1:3]
os.makedirs(dst, exist_ok=True)
for f in ("delay.sv", "pe.sv", "sa_top.sv", "npu_avmm.sv", "lut_tables.svh"):
    shutil.copy(os.path.join(src, f), dst)

# delay.sv có generate-if cấp module; wrapper cú pháp tường minh thêm quanh nhánh.
# Guard dùng substring trong toàn file, nên marker trong comment cũng được nhìn thấy.
p = os.path.join(dst, "delay.sv")
s = open(p).read()
if "endgenerate" not in s:
    s = s.replace("    if (D == 0) begin : g_wire", "    generate\n    if (D == 0) begin : g_wire")
    s = s.replace("    end\nendmodule", "    end\n    endgenerate\nendmodule")
open(p, "w").write(s)

# sa_top dùng nhiều vòng genvar; script khai báo i,j chung rồi bỏ genvar trong for.
# Điểm chèn dựa trên nguyên văn comment input skew và newline ở RTL nguồn.
# Không thay số stage/skew hay phép MAC; chỉ đổi cú pháp bản sao cho Quartus.
p = os.path.join(dst, "sa_top.sv")
s = open(p).read()
if "endgenerate" not in s:
    s = s.replace("    // input skew: row i delayed by i cycles\n",
                  "    genvar i, j;\n    generate\n    // input skew: row i delayed by i cycles\n")
    s = s.replace("endmodule", "    endgenerate\nendmodule")
    s = re.sub(r"for \(genvar (\w+) =", r"for (\1 =", s)
open(p, "w").write(s)
# Assert cuối chỉ kiểm có substring generate, không chứng minh tương đương chức năng.
# Muốn xác nhận compile/synthesis phải dùng build flow; stdout chỉ in source -> dest.
for f in ("delay.sv", "sa_top.sv"):
    assert "generate" in open(os.path.join(dst, f)).read(), f
print("make_compat: %s -> %s" % (src, dst))
