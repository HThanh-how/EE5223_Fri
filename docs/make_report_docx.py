# -*- coding: utf-8 -*-
"""Sinh EE5223_report_Nhom5.docx tu ban goc (chi doc, khong ghi de ban goc).

Moi doan tO vang (highlight yellow) duoc thay bang noi dung that, clone pPr/rPr
tu doan lan can cua ban goc. Cac doan khac giu nguyen.
"""
import copy
import os
import re

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm

SRC = r"D:\Phd\EE5223_Fri\Nhóm 5 - 100% 20261120.docx"
DST = r"D:\Phd\EE5223_Fri\proj\docs\EE5223_report_Nhom5.docx"
PNG = r"C:\Users\Admin\AppData\Local\Temp\claude\ee5223_png"
TEX = r"D:\Phd\EE5223_Fri\proj\tex"
BIB = r"D:\Phd\EE5223_Fri\proj\references.bib"
W14_PARAID = "{http://schemas.microsoft.com/office/word/2010/wordml}paraId"
W14_TEXTID = "{http://schemas.microsoft.com/office/word/2010/wordml}textId"

doc = docx.Document(SRC)
P = list(doc.paragraphs)          # chi so khop voi ban dump (388 doan)
T0 = doc.tables[0]._tbl           # bang mau (Bang 2.1)

# Mau lay tu ban goc
T_BODY = P[151]._p                # doan thuong
T_BUL = P[153]._p                 # gach dau dong (numId 20)
T_H2 = P[348]._p                  # Heading 2 (Chuong 5)
T_H3 = P[363]._p                  # Heading 3 (5.3)
T_CAP_TAB = P[158]._p             # chu thich bang (Heading 4)
T_CAP_FIG = P[157]._p             # chu thich hinh (thuong)


def strip_hl(el):
    for h in list(el.iter(qn("w:highlight"))):
        h.getparent().remove(h)


def _first_rpr(tpl):
    for r in tpl.iter(qn("w:r")):
        rp = r.find(qn("w:rPr"))
        if rp is not None and r.find(qn("w:t")) is not None:
            return rp
    return None


def new_p(tpl, runs):
    """Tao doan moi tu mau tpl. runs = [(text, bold)]."""
    el = copy.deepcopy(tpl)
    for c in list(el):
        if c.tag != qn("w:pPr"):
            el.remove(c)
    for a in list(el.attrib):
        if a in (W14_PARAID, W14_TEXTID):
            del el.attrib[a]
    ppr = el.find(qn("w:pPr"))
    if ppr is not None:
        strip_hl(ppr)
    rpr_tpl = _first_rpr(tpl)
    for text, bold in runs:
        r = OxmlElement("w:r")
        rp = copy.deepcopy(rpr_tpl) if rpr_tpl is not None else OxmlElement("w:rPr")
        strip_hl(rp)
        for tag in ("w:b", "w:bCs"):
            for x in rp.findall(qn(tag)):
                rp.remove(x)
        if bold:
            b = OxmlElement("w:b")
            bcs = OxmlElement("w:bCs")
            pos = 1 if (len(rp) and rp[0].tag == qn("w:rFonts")) else 0
            rp.insert(pos, bcs)
            rp.insert(pos, b)
        r.append(rp)
        t = OxmlElement("w:t")
        t.set(qn("xml:space"), "preserve")
        t.text = text
        r.append(t)
        el.append(r)
    return el


def center(el):
    ppr = el.find(qn("w:pPr"))
    if ppr is None:
        ppr = OxmlElement("w:pPr")
        el.insert(0, ppr)
    jc = OxmlElement("w:jc")
    jc.set(qn("w:val"), "center")
    rpr = ppr.find(qn("w:rPr"))
    if rpr is not None:
        rpr.addprevious(jc)
    else:
        ppr.append(jc)
    return el


def para(text, bold_prefix=None):
    runs = []
    if bold_prefix:
        runs.append((bold_prefix, True))
    runs.append((text, False))
    return new_p(T_BODY, runs)


def h2(text):
    return new_p(T_H2, [(text, False)])


def h3(text):
    return new_p(T_H3, [(text, False)])


def bullet(text, bold_prefix=None):
    runs = []
    if bold_prefix:
        runs.append((bold_prefix, True))
    runs.append((text, False))
    return new_p(T_BUL, runs)


def fig(png, caption):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(os.path.join(PNG, png), width=Cm(15))
    cap = center(new_p(T_CAP_FIG, [(caption, False)]))
    return [p._p, cap]


def cap_tab(text):
    el = new_p(T_CAP_TAB, [(text, False)])
    ppr = el.find(qn("w:pPr"))
    kn = ppr.find(qn("w:keepNext"))
    if kn is None:
        kn = OxmlElement("w:keepNext")
        ppr.insert(1 if ppr.find(qn("w:pStyle")) is not None else 0, kn)
    kn.set(qn("w:val"), "1")
    return el


def table(headers, rows, weights):
    total = 8805
    s = sum(weights)
    ws = [round(total * w / s) for w in weights]
    t = copy.deepcopy(T0)
    for c in list(t):
        if c.tag != qn("w:tblPr"):
            t.remove(c)
    tblW = t.find(qn("w:tblPr")).find(qn("w:tblW"))
    tblW.set(qn("w:w"), str(total))
    tblW.set(qn("w:type"), "dxa")
    grid = OxmlElement("w:tblGrid")
    for w in ws:
        gc = OxmlElement("w:gridCol")
        gc.set(qn("w:w"), str(w))
        grid.append(gc)
    t.append(grid)
    trs = T0.findall(qn("w:tr"))
    hdr_tpl, body_tpl = trs[0], trs[1]
    for ri, row in enumerate([headers] + rows):
        tpl_tr = hdr_tpl if ri == 0 else body_tpl
        tr = copy.deepcopy(tpl_tr)
        tcs = tr.findall(qn("w:tc"))
        for c in tcs:
            tr.remove(c)
        for j, txt in enumerate(row):
            src_tc = tcs[min(j, len(tcs) - 1)]
            tc = copy.deepcopy(src_tc)
            tcpr = tc.find(qn("w:tcPr"))
            for x in tcpr.findall(qn("w:tcW")):
                tcpr.remove(x)
            tcw = OxmlElement("w:tcW")
            tcw.set(qn("w:w"), str(ws[j]))
            tcw.set(qn("w:type"), "dxa")
            tcpr.insert(0, tcw)
            ps = tc.findall(qn("w:p"))
            for extra in ps[1:]:
                tc.remove(extra)
            newp = new_p(ps[0], [(txt, False)])
            sp = newp.find(qn("w:pPr")).find(qn("w:spacing")) if newp.find(qn("w:pPr")) is not None else None
            if sp is not None:
                sp.set(qn("w:before"), "60")
                sp.set(qn("w:after"), "60")
            tc.replace(ps[0], newp)
            tr.append(tc)
        if ri < len(rows):  # giu bang khong bi tach trang (tru hang cuoi)
            for pp in tr.iter(qn("w:p")):
                ppr = pp.find(qn("w:pPr"))
                if ppr is None:
                    ppr = OxmlElement("w:pPr")
                    pp.insert(0, ppr)
                if ppr.find(qn("w:keepNext")) is None:
                    ppr.insert(1 if ppr.find(qn("w:pStyle")) is not None else 0, OxmlElement("w:keepNext"))
        trpr = tr.find(qn("w:trPr"))
        if trpr is not None:
            for x in trpr.findall(qn("w:trHeight")):
                trpr.remove(x)
        t.append(tr)
    return t


def replace(idx, elems):
    old = P[idx]._p
    for el in elems:
        old.addprevious(el)
    old.getparent().remove(old)


def keep_after(idx, elems):
    """Giu doan goc (bo highlight), chen noi dung sau no."""
    cur = P[idx]._p
    strip_hl(cur)
    for el in elems:
        cur.addnext(el)
        cur = el


# ---------------------------------------------------------------- Chuong 3
replace(136, [
    para("Hình 3.1 trình bày sơ đồ khối tổng thể. CPU RISC-V (PicoRV32 khi mô phỏng, "
         "Nios V trên DE10-Nano) ghi cấu hình, trọng số và kích hoạt qua bus Avalon-MM "
         "tới npu_avmm; npu_avmm điều khiển mảng sa_top và khối hậu xử lý, CPU đọc kết quả "
         "từ CBUF/QBUF."),
    *fig("slide2.png", "Hình 3.1: Sơ đồ khối tổng thể hệ thống (CPU RISC-V, bus Avalon-MM, npu_avmm, sa_top, hậu xử lý)"),
])
replace(171, fig("slide3.png", "Hình 3.2: Mảng Systolic Array N×N (sa_top) với luồng kích hoạt và tổng riêng"))
replace(192, fig("slide5.png", "Hình 3.3: Khối skew (trễ hàng đầu vào) và de-skew (căn chỉnh hàng đầu ra) của mảng systolic"))
replace(200, fig("slide6.png", "Hình 3.4: Wrapper Avalon-MM npu_avmm: giải mã địa chỉ, thanh ghi, bộ đệm và bộ tuần tự"))
replace(249, fig("slide7.png", "Hình 3.5: Đường dữ liệu khối hậu xử lý lượng tử hóa (cộng bias, nhân hệ số, làm tròn, bão hòa, hàm kích hoạt)"))

# ---------------------------------------------------------------- Chuong 5
# 5.1 Moi truong thuc nghiem
keep_after(350, [
    para("Mô phỏng RTL bằng Verilator 5.032 (testbench C++ và SoC PicoRV32 với firmware thật) "
         "là bằng chứng kiểm chứng chính. ModelSim/Questa chỉ dùng để quan sát RTL và dạng sóng; "
         "chưa có bộ kết quả ModelSim tương ứng nên không xem đó là một lần kiểm chứng đã hoàn tất."),
])
replace(351, [
    para("Kiểm chứng theo bốn tầng, từ khối nhỏ nhất đến hệ thống. Ở mọi tầng, kết quả được so sánh "
         "bit-exact với mô hình tham chiếu độc lập (GEMM C++ int32, requant_ref bằng C, GEMM C trên CPU, "
         "Python cnn_int/lstm_int). Đường CPU-only đọc trọng số và kích hoạt từ RAM, thực hiện GEMM và "
         "requant bằng C. Đường CPU+NPU ghi cấu hình và tile qua Avalon-MM, chờ done rồi đọc QBUF."),
    para("Tầng 1: unit test sa_top (26 test cho mỗi N, gồm identity, một hàng, hàng liên tiếp, khoảng trống "
         "ngẫu nhiên, giá trị âm cực đại và 20 test ngẫu nhiên). Tầng 2: selftest hậu xử lý trên SoC với "
         "24 phép thử, so sánh cả CBUF (INT32) và QBUF (INT8). Tầng 3: GEMM demo với M = 1, 8, 32, 64. "
         "Tầng 4: suy luận LeNet-5 (8 ảnh) và LSTM (16 ảnh) so với golden."),
    cap_tab("Bảng 5.1: Tổng hợp kết quả kiểm chứng (mô phỏng Verilator 5.032)"),
    table(["Bộ kiểm chứng", "N = 4", "N = 8", "Nguồn log"], [
        ["Unit test sa_top (26 test)", "26/26 PASS", "26/26 PASS", "demo/demo_output/stage1_unit.txt; results/test_N8.log"],
        ["Selftest hậu xử lý (24 phép thử)", "24/24 PASS", "24/24 PASS", "results/selftest_N*.log"],
        ["GEMM demo (M = 1, 8, 32, 64)", "4/4, 0 sai", "4/4, 0 sai", "results/run_N4.log, results/gemm_demo_N8.log"],
        ["LeNet-5, 8 ảnh (CPU và NPU so với golden)", "0 sai, 8/8 đúng nhãn", "0 sai, 8/8 đúng nhãn", "results/cnn_N*.log"],
        ["LSTM, 16 ảnh (CPU, batch 1, batch 16)", "0 sai, 16/16", "0 sai, 16/16", "results/lstm_N*.log"],
    ], [3.0, 1.9, 1.9, 3.4]),
    para("Giới hạn: kiểm chứng là mô phỏng có định hướng cộng ngẫu nhiên. Không dùng formal, không đo "
         "coverage và không dùng SVA. Chưa kiểm tra có hệ thống việc ghi ABUF/WEIGHT khi busy, M = 0 hoặc "
         "M > 64, và đọc ngoài phạm vi bộ đệm. Số ảnh chạy trên RTL (8 và 16) còn nhỏ do tốc độ mô phỏng; "
         "độ chính xác trên 10.000 ảnh được đo bằng mô hình số nguyên Python."),
])
keep_after(352, [
    para("Hệ thống Nios V/g với NPU đã được fit trên DE10-Nano (Quartus Lite 25.1std), đạt timing ở "
         "CLOCK_50. Phần này chỉ là bằng chứng hiện thực, chưa thay thế phép thử trên board."),
])
keep_after(353, [
    para("Kết quả fit và Fmax được trình bày ở Mục 5.2 (Bảng 5.2). Hệ thống chưa được chạy trên board "
         "vật lý; kết quả chạy trên board (PASS/FAIL, chu kỳ, speedup) sẽ bổ sung khi có."),
])

# 5.2 Cac chi so danh gia (cac muc bullet giu nguyen, bo highlight)
keep_after(355, [
    para("Latency một ảnh được tính từ số chu kỳ trong log và quy đổi t = C/f ở mốc 50 MHz (giả định, "
         "không đo trên board): LeNet-5 CPU-only 13,254,324 chu kỳ (265.086 ms), NPU N = 8 "
         "1,923,665 chu kỳ (38.473 ms). Độ trễ hàng của mảng là 2N−1 chu kỳ (7 với N = 4, 15 với N = 8)."),
])
keep_after(356, [
    para("GOPS hữu ích = 2Qf/(C·10⁹), với Q là số MAC hữu ích trên một ảnh (LeNet-5: 281,640; LSTM: 79,008). "
         "Đỉnh lý thuyết = 2N²f/10⁹ = 6.4 GOPS với N = 8 tại 50 MHz. LeNet-5 NPU N = 8 đạt 0.014641 GOPS hữu ích."),
])
keep_after(357, [
    para("U_busy = Q/(N²·C_busy) và U_end = Q/(N²·C_host). LeNet-5 với N = 8: U_busy = 25.44%, "
         "U_end = 0.229%. Hai giá trị khác nhau vì U_end tính thêm thời gian CPU và MMIO; cả hai là "
         "ước lượng mức khai thác năng lực tính toán, không phải đo clock-enable hay năng lượng từng PE."),
])
keep_after(358, [
    para("Số chu kỳ được lấy từ log mô phỏng và thanh ghi CYCLES của NPU. Với LeNet-5, số lượt chạy NPU "
         "(passes) là 741 ở N = 8 và 2964 ở N = 4. Chu kỳ busy và chu kỳ host được báo cáo riêng."),
])
keep_after(359, [
    para("Chưa đo. Báo cáo không có số công suất hoặc năng lượng. Phương pháp dự kiến: đo dòng hoặc dùng "
         "Power Analyzer trên board, kết hợp VCD để tính năng lượng trên mỗi ảnh và GOPS/W. Chỉ điền số "
         "sau khi có phép đo đúng phạm vi."),
])
keep_after(360, [
    para("Tài nguyên được lấy từ fitter report của hệ thống Nios V/g trên DE10-Nano. Đây là toàn SoC, "
         "không phải riêng mảng PE; không quy đổi sang mm²."),
    cap_tab("Bảng 5.2: Tài nguyên và tần số của hệ thống Nios V/g trên DE10-Nano"),
    table(["Tài nguyên", "Sử dụng", "Tổng", "Tỉ lệ"], [
        ["ALM", "6,758", "41,910", "16%"],
        ["Registers", "8,603", "–", "–"],
        ["Memory bits", "2,433,272", "5,662,720", "43%"],
        ["DSP", "51", "112", "46%"],
        ["Fmax (CLOCK_50, slow 1100 mV, 100°C)", "72.56 MHz", "–", "–"],
    ], [3.6, 1.8, 1.8, 1.4]),
])
keep_after(361, [
    para("Dataflow là weight-stationary ở PE; ma trận kích hoạt chảy ngang, tổng riêng chảy dọc. RTL hiện tại "
         "là dense: không có bộ giải mã sparse, không bỏ qua MAC bằng 0, nên ReLU hay pruning chưa tự làm giảm "
         "số lượt chạy. Không có thí nghiệm pruning trong các log của báo cáo (xem Mục 6.3)."),
])
keep_after(362, [
    para("Arithmetic intensity I = 2Q/B, với B là payload truyền qua giao diện Avalon-MM. Ví dụ GEMM "
         "M = 64, N = 8, đầu ra INT32: B = 2624 byte, I ≈ 3.12 phép toán/byte. Với bus 32 bit lý tưởng "
         "(200 MB/s ở 50 MHz), trần roofline là ≈ 0.624 GOPS, thấp hơn đỉnh 6.4 GOPS. Đây là cận lý tưởng, "
         "không phải throughput đo được."),
])

# 5.3 Demo ung dung
replace(364, [
    para("Demo LeNet-5 nhận dạng chữ số viết tay MNIST chạy trên CPU với phần GEMM đưa xuống NPU. Trên 8 ảnh "
         "đầu của tập kiểm tra, đầu ra CPU và NPU đều trùng golden (0 sai, 8/8 đúng nhãn). Độ chính xác INT8 "
         "trên 10.000 ảnh (mô hình số nguyên Python) là 98.85%, so với 98.83% của mô hình số thực. Demo LSTM "
         "16 ảnh cho 0 sai so với golden và độ chính xác 97.50% (float 97.58%)."),
])

# 5.4 So sanh hieu nang
for _t in P[366]._p.iter(qn("w:t")):
    _t.text = re.sub(r"\s*Block diagram,\s*Datapath\s*$", "", _t.text)
keep_after(366, [
    para("Đường CPU-only (cpu_matmul, C -O2, trên PicoRV32) so với CPU+NPU, cùng trọng số INT8 và quy tắc "
         "làm tròn. Với N = 8: LeNet-5 nhanh 6.9 lần (13,254,324 → 1,923,665 chu kỳ/ảnh); LSTM nhanh 3.3 lần "
         "với batch 1 (3,559,094 → 1,068,230) và 16.4 lần với batch 16 (217,262 chu kỳ/ảnh bình quân)."),
])
keep_after(367, [
    para("Chưa thực hiện. Repo chưa có benchmark ARM Cortex hoặc x86; Cortex-A9 của HPS không được dùng trong "
         "hệ thống hiện tại. Không suy ra latency bằng cách chia chu kỳ PicoRV32 cho clock của CPU khác."),
])
keep_after(368, [
    cap_tab("Bảng 5.3: So sánh chu kỳ và hiệu năng quy đổi ở 50 MHz"),
    table(["Mạng", "Đường chạy", "Chu kỳ/ảnh", "ms/ảnh", "ảnh/s", "GOPS hữu ích"], [
        ["LeNet-5", "CPU-only", "13,254,324", "265.086", "3.77", "0.002125"],
        ["LeNet-5", "CPU + NPU (N = 8)", "1,923,665", "38.473", "25.99", "0.014641"],
        ["LSTM", "CPU-only", "3,559,094", "71.182", "14.05", "0.002220"],
        ["LSTM", "NPU batch 1", "1,068,230", "21.365", "46.81", "0.007396"],
        ["LSTM", "NPU batch 16", "217,262", "4.345*", "230.14*", "0.036365"],
    ], [1.5, 2.4, 1.9, 1.5, 1.4, 1.8]),
    para("ms/ảnh và ảnh/s quy đổi ở 50 MHz (tính toán, không đo trên board). * Batch 16 là giá trị bình quân "
         "trên một ảnh; toàn batch 16 ảnh khoảng 69.524 ms, chưa tính thời gian gom batch."),
])

# 5.5 Phan tich ket qua
replace(369, [
    h3("5.5. Phân tích kết quả và nhận xét"),
    para("Tính đúng số học và hiệu năng hệ thống cần được đánh giá riêng. LeNet-5 đạt 98.85% INT8 trên "
         "10.000 ảnh bằng mô hình số nguyên Python; so sánh RTL trên 8 ảnh chỉ xác nhận đầu ra trùng golden, "
         "không tương đương chạy toàn bộ tập kiểm tra trên board."),
    para("Speedup 6.9 lần (LeNet-5, N = 8) là kết quả đo chu kỳ trong mô phỏng PicoRV32; 6.4 GOPS là trần lý "
         "thuyết tại 50 MHz. Chênh lệch lớn giữa U_busy = 25.44% và U_end = 0.229% cho thấy chi phí chép dữ liệu "
         "qua MMIO và phần mềm quyết định phần lớn kết quả hệ thống."),
    para("Nút thắt chính là im2col và pooling chạy trên CPU (khoảng 63% thời gian với N = 8) và việc chép dữ "
         "liệu qua MMIO (khoảng 30%). Vì vậy ưu tiên là giảm di chuyển dữ liệu và tiền xử lý trên CPU, sau đó "
         "mới mở rộng mảng. Tăng N cải thiện đỉnh nhưng tăng độ trễ lấp đường ống và padding."),
    para("Batching cải thiện tái sử dụng trọng số (LSTM batch 16 đạt 16.4 lần) nhưng làm tăng thời gian trả cả "
         "batch (khoảng 69.5 ms). Fitter cho thấy SoC đạt Fmax 72.56 MHz, cao hơn mốc 50 MHz. Các kết luận về "
         "latency vật lý, công suất, năng lượng và so với ARM/x86 cần thí nghiệm riêng."),
])

# ---------------------------------------------------------------- Chuong 6
replace(373, [h2("Chương 6. Kết luận và hướng phát triển")])
replace(374, [
    h3("6.1. Kết luận"),
    bullet("Đề tài đã thiết kế, kiểm chứng và tích hợp bộ tăng tốc INT8 kiểu weight-stationary N×N vào hệ "
           "thống RISC-V, mở rộng cho CNN (LeNet-5) và RNN (LSTM)."),
    bullet("Mọi đầu ra RTL và CPU trùng khớp từng bit với mô hình số nguyên Python: 26 unit test mảng, "
           "24 phép thử hậu xử lý, 4 kích thước GEMM, 8 ảnh LeNet-5 và 16 ảnh LSTM cho N = 4 và N = 8."),
    bullet("Độ chính xác INT8: LeNet-5 98.85% (float 98.83%), LSTM 97.50% (float 97.58%)."),
    bullet("Với N = 8 trên PicoRV32 mô phỏng: LeNet-5 nhanh 6.9 lần; LSTM nhanh 3.3 lần (batch 1) và "
           "16.4 lần (batch 16)."),
    bullet("Trên DE10-Nano, hệ thống Nios V/g fit với 16% ALM và đạt Fmax 72.56 MHz. Hệ thống chưa được "
           "chạy trên board vật lý."),
])
replace(375, [
    h3("6.2. Hạn chế của đề tài"),
    bullet("Chu kỳ được đo trên SoC PicoRV32 mô phỏng. Các giá trị ms, ảnh/s và GOPS tại 50 MHz là tính toán, "
           "không thay thế số đo phần cứng."),
    bullet("Công suất và năng lượng chưa đo trên board; chưa có benchmark ARM/x86."),
    bullet("Thiết kế chưa có DMA, double buffering, im2col hay pooling phần cứng, và chưa xử lý sparse. "
           "Nút thắt là im2col/pooling trên CPU và chép dữ liệu qua MMIO."),
    bullet("Kiểm chứng chưa có formal, coverage hay SVA; số ảnh chạy trên RTL còn nhỏ (8 và 16)."),
])
replace(376, [
    h3("6.3. Hướng phát triển tiếp theo"),
    bullet("Chạy selftest và hai workload trên DE10-Nano, lưu chu kỳ theo cấu hình; đo công suất và thiết lập "
           "baseline ARM/x86. Đây là bước cần thiết để chuyển kết luận mô phỏng thành đánh giá phần cứng."),
    bullet("DMA (Avalon-MM master) để NPU tự đọc và ghi dữ liệu theo bộ mô tả, giảm việc chép bằng CPU."),
    bullet("im2col và maxpool trong phần cứng để giảm giới hạn Amdahl (khoảng 10.9 lần)."),
    bullet("Double buffering ABUF/trọng số và ngắt thay cho polling."),
    bullet("Bộ đệm lớn hơn (M10K), xử lý element-wise của LSTM trong phần cứng, thử H lớn hơn."),
    bullet("Khai thác sparsity có cấu trúc (pruning theo kênh hoặc khối) và lượng tử hóa theo kênh."),
    bullet("Tích hợp chặt hơn với RISC-V (kiểu RoCC), kiểm chứng mạnh hơn (SVA, formal), và luồng ASIC "
           "với PDK mở để đo diện tích, công suất và tần số."),
])

# ---------------------------------------------------------------- Phu luc
APPX = [
    ("Phụ lục A. Các phép dẫn chi tiết", "phép dẫn công thức lượng tử hóa, GEMM và chống tràn bit."),
    ("Phụ lục B. Bản đồ thanh ghi và API driver", "bảng thanh ghi, địa chỉ và API của fw/npu.h."),
    ("Phụ lục C. Hướng dẫn tái lập kết quả", "các lệnh build, mô phỏng và chạy lại log."),
    ("Phụ lục D. Docker, CI và phát hành", "môi trường Docker, quy trình CI và phát hành."),
    ("Phụ lục E. Trích đoạn log kiểm thử", "trích đoạn log unit test, selftest, GEMM, CNN và LSTM."),
]
phu_luc = [h2("Phụ lục")]
for title, desc in APPX:
    phu_luc.append(bullet(desc, bold_prefix=title + ": "))
replace(378, phu_luc)

TABLE_LIST = [
    "Bảng 2.1: So sánh định tính các kiểu Dataflow cho mảng Systolic Array",
    "Bảng 3.1: Mô tả các cổng tín hiệu giao tiếp của mô-đun PE (pe.sv)",
    "Bảng 4.1: Danh mục các tệp nguồn trong hệ thống Firmware C (fw/)",
    "Bảng 4.2: Thông số ánh xạ các tầng LeNet-5 lên bộ tăng tốc NPU",
    "Bảng 5.1: Tổng hợp kết quả kiểm chứng (mô phỏng Verilator 5.032)",
    "Bảng 5.2: Tài nguyên và tần số của hệ thống Nios V/g trên DE10-Nano",
    "Bảng 5.3: So sánh chu kỳ và hiệu năng quy đổi ở 50 MHz",
]
replace(380, [h2("Danh mục bảng")] + [bullet(x) for x in TABLE_LIST])


def read_acronyms():
    txt = open(os.path.join(TEX, "acronyms.tex"), encoding="utf8").read()
    out = []
    for m in re.finditer(r"\\item\[([^\]]+)\]\s*(.*)", txt):
        key, desc = m.group(1), m.group(2).strip()
        desc = desc.replace("\\NPU{}", "NPU").replace("\\NPU", "NPU")
        desc = re.sub(r"\\code\{([^}]*)\}", r"\1", desc)
        desc = re.sub(r"\\textbf\{([^}]*)\}", r"\1", desc)
        desc = desc.replace("\\&", "&").replace("\\%", "%").replace("--", "–")
        desc = desc.replace("{", "").replace("}", "").replace("$", "")
        desc = desc.replace("\\", "").strip()
        out.append([key.replace("\\", ""), desc])
    return out


ACR = read_acronyms()
replace(383, [h2("Từ viết tắt"),
              table(["Viết tắt", "Ý nghĩa"], ACR, [1.4, 4.6])])


def read_bib():
    txt = open(BIB, encoding="utf8").read()
    entries = []
    for block in re.split(r"\n@", "\n" + txt):
        if not block.strip():
            continue
        fields = {}
        for line in block.splitlines():
            m = re.match(r"\s*(\w+)\s*=\s*\{(.*)\},?\s*$", line)
            if m:
                fields[m.group(1).lower()] = m.group(2)
        if "title" not in fields:
            continue
        author = fields.get("author", "").replace(" and ", ", ")
        venue = fields.get("journal") or fields.get("booktitle") or fields.get("publisher") or fields.get("howpublished") or ""
        clean = lambda x: x.replace("{", "").replace("}", "").strip()
        author, title, venue = clean(author), clean(fields["title"]), clean(venue)
        head = title if title[-1:] in "?!." else title + "."
        if author:
            head = author.rstrip(".") + ". " + head
        tail = ", ".join(x for x in [venue, fields.get("year", "")] if x)
        entries.append(head + (" " + tail + "." if tail else ""))
    return entries


refs = read_bib()
ref_items = [bullet(r) for r in refs]
replace(385, [h2("Tài liệu tham khảo")] + ref_items)

# Quet cuoi: go highlight vang con sot (vd. duong ke phan cach rong)
for h in list(doc.element.body.iter(qn("w:highlight"))):
    if h.get(qn("w:val")) == "yellow":
        h.getparent().remove(h)

doc.save(DST)
print("saved", DST, "acronyms", len(ACR), "refs", len(refs))
