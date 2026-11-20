/* EE5223 deck: every content slide is an interactive vector diagram (inline SVG).
   Hover a block: it lights up, its wires light up, and a one-line explanation appears.
   Facts come from rtl/*.sv, soc/soc_top.sv, scripts/quantize.py, results/*.log, de10/reports and README.md.
   This file also replaces window.SLIDES (content.js supplies the speaker notes of the old slides). */
(function () {
'use strict';
var W = 1700, H = 780;
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function fit(t, w, max) { return Math.max(13, Math.min(max, (w - 18) / (0.6 * String(t).length))); }
var uid = 0;
function slug(s) { uid++; return 'b' + uid; }

function mk(id) {
  var o = [], boxes = [], arrows = [];
  function push(s) { o.push(s); }
  var api = {
    /* box with up to 4 centred text lines. info = text shown on hover. extra = {id, d (anim delay s), anim (class)} */
    box: function (x, y, w, h, cls, lines, info, extra) {
      extra = extra || {};
      var bid = extra.id || slug(lines[0]), n = lines.length;
      var g = '<g class="bx ' + cls + (extra.anim ? ' ' + extra.anim : '') + '" data-id="' + bid + '" data-n="' + esc(lines[0]) + '" data-i="' + esc(info || '') + '"' +
        (extra.d !== undefined ? ' style="--d:' + extra.d + 's"' : '') + '><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3"/>';
      var sc = extra.s || 1, gap = 29 * sc, y0 = y + h / 2 - (n - 1) * gap / 2 + 7;
      lines.forEach(function (t, k) {
        if (t === '') return;
        g += '<text x="' + (x + w / 2) + '" y="' + (y0 + k * gap).toFixed(1) + '" text-anchor="middle" class="' + (k ? 't2' : 't1') + '" font-size="' + fit(t, w, (k ? 19 : 24) * sc).toFixed(1) + '">' + esc(t) + '</text>';
      });
      push(g + '</g>');
      boxes.push({ id: bid, x: x, y: y, w: w, h: h });
      return bid;
    },
    /* generic hoverable group: begin(...) ... end() */
    begin: function (bid, name, info, cls, x, y, w, h) {
      push('<g class="bx ' + (cls || 'dp') + '" data-id="' + bid + '" data-n="' + esc(name) + '" data-i="' + esc(info || '') + '">');
      if (x !== undefined) boxes.push({ id: bid, x: x, y: y, w: w, h: h });
    },
    end: function () { push('</g>'); },
    arrow: function (pts, kind, both) {
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
      arrows.push({ pts: pts });
      push('@@AR' + (arrows.length - 1) + '@@<path class="ar ' + (kind || 'd') + '" d="' + d + '" marker-end="url(#' + id + (kind === 'c' ? 'c' : 'd') + ')"' + (both ? ' marker-start="url(#' + id + (kind === 'c' ? 'c' : 'd') + 's)"' : '') + '/></g>');
    },
    text: function (x, y, t, cls, size, anchor, style) {
      push('<text x="' + x + '" y="' + y + '" class="' + (cls || 'cap') + '" font-size="' + (size || 20) + '" text-anchor="' + (anchor || 'start') + '"' + (style ? ' style="' + style + '"' : '') + '>' + esc(t) + '</text>');
    },
    frame: function (x, y, w, h, label) {
      push('<rect class="frame" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4"/>');
      if (label) push('<text x="' + (x + 18) + '" y="' + (y + 32) + '" class="fl" font-size="21">' + esc(label) + '</text>');
    },
    ff: function (x, y, s, d) { push('<rect class="ff" x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" style="--d:' + (d || 0) + 's"/>'); },
    raw: push,
    legend: function () {
      var items = [['dp', 'datapath'], ['ctl', 'điều khiển'], ['mem', 'bộ nhớ'], ['ext', 'ngoài khối']], x = 0;
      items.forEach(function (it) {
        push('<rect class="lg ' + it[0] + '" x="' + x + '" y="752" width="26" height="16" rx="2"/><text x="' + (x + 36) + '" y="766" class="cap" font-size="19">' + it[1] + '</text>');
        x += 36 + it[1].length * 11.6 + 40;
      });
    },
    done: function () {
      function near(p, b) { return p[0] >= b.x - 5 && p[0] <= b.x + b.w + 5 && p[1] >= b.y - 5 && p[1] <= b.y + b.h + 5; }
      var s = o.join('');
      arrows.forEach(function (a, k) {
        var f = '', t = '';
        boxes.forEach(function (b) { if (!f && near(a.pts[0], b)) f = b.id; if (!t && near(a.pts[a.pts.length - 1], b)) t = b.id; });
        s = s.replace('@@AR' + k + '@@', '<g class="aw" data-f="' + f + '" data-t="' + t + '">');
      });
      var defs = '<defs>' + ['d', 'c'].map(function (k) {
        return '<marker id="' + id + k + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" class="mk ' + k + '"/></marker>' +
          '<marker id="' + id + k + 's" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mk ' + k + '"/></marker>';
      }).join('') + '</defs>';
      return '<svg class="dsvg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' + defs + s + '</svg>';
    }
  };
  return api;
}

/* ============================================================ 2. GEMM is the common kernel */
function dGemm() {
  var g = mk('gm'), r, c, P = 40, S = 36;
  g.box(0, 40, 380, 200, 'ext', ['LeNet-5 · CNN', 'convolution → im2col', 'FC = GEMM sẵn có'], 'CNN: lớp convolution được trải phẳng bằng im2col thành phép nhân ma trận; lớp fully-connected vốn là GEMM.');
  g.box(0, 330, 380, 200, 'ext', ['LSTM', '4 cổng i · f · g · o', 'gộp thành GEMM'], 'LSTM: các phép nhân ma trận của bốn cổng được biểu diễn dưới dạng GEMM; phép cập nhật cell từng phần tử vẫn chạy trên CPU.');
  g.arrow([[380, 140], [540, 140]], 'd');
  g.arrow([[380, 430], [540, 430]], 'd');
  g.begin('gemm', 'GEMM INT8', 'C[M×N] = A[M×K] × W[K×N]: mỗi phần tử C là tích vô hướng của một hàng A với một cột W, tích lũy INT32. Đây là kernel dùng chung cho CNN và LSTM.', 'dp', 540, 30, 640, 520);
  g.raw('<rect x="540" y="30" width="640" height="520" rx="3"/>');
  g.text(860, 82, 'GEMM INT8', 't1', 32, 'middle');
  g.text(860, 118, 'C = A × W · tích lũy INT32', 't2', 21, 'middle');
  var ax = 570, wx = 775, cx = 975, gy = 190;
  for (r = 0; r < 4; r++) for (c = 0; c < 4; c++) {
    g.raw('<rect class="mc ra" x="' + (ax + c * P) + '" y="' + (gy + r * P) + '" width="' + S + '" height="' + S + '" style="--d:' + (r * 1.2) + 's"/>');
    g.raw('<rect class="mc cw" x="' + (wx + c * P) + '" y="' + (gy + r * P) + '" width="' + S + '" height="' + S + '" style="--d:' + (c * 0.3) + 's"/>');
    g.raw('<rect class="mc cc" x="' + (cx + c * P) + '" y="' + (gy + r * P) + '" width="' + S + '" height="' + S + '" style="--d:' + ((r * 4 + c) * 0.3) + 's"/>');
  }
  g.text(ax + 80, 380, 'A (M×K)', 'cap', 20, 'middle'); g.text(wx + 80, 380, 'W (K×N)', 'cap', 20, 'middle'); g.text(cx + 80, 380, 'C (M×N)', 'cap', 20, 'middle');
  g.text(752, 285, '×', 't1', 40, 'middle'); g.text(952, 285, '=', 't1', 40, 'middle');
  g.text(860, 450, 'một hàng A × một cột W → một phần tử C', 'cap', 21, 'middle');
  g.text(860, 490, 'cam: hàng và cột đang nhân · xanh: phần tử kết quả', 'cap', 18, 'middle');
  g.end();
  g.box(1330, 100, 370, 210, 'dp', ['NPU · sa_top', 'mảng PE N × N', 'chia GEMM thành tile', 'cộng dồn K-chunk'], 'NPU xử lý từng tile N×N của GEMM; các K-chunk được cộng dồn vào CBUF rồi hậu xử lý về INT8.');
  g.arrow([[1180, 205], [1330, 205]], 'd');
  g.box(1330, 400, 370, 150, 'ext', ['CPU RISC-V', 'im2col · pooling', 'cập nhật cell LSTM'], 'Những bước không phải phép nhân ma trận (im2col, pooling, cập nhật cell) vẫn chạy bằng firmware trên CPU.');
  g.arrow([[1515, 310], [1515, 400]], 'd', true);
  g.text(0, 600, 'Một kiến trúc tăng tốc, hai loại mạng: toàn bộ phép nhân ma trận đi qua cùng một đường INT8.', 'cap', 21);
  g.legend();
  return g.done();
}

/* ============================================================ 3. system */
function dSys() {
  var g = mk('sy');
  g.frame(620, 10, 1080, 720, 'npu_avmm · wrapper Avalon-MM slave');
  g.box(0, 215, 300, 150, 'ext', ['CPU RISC-V', 'PicoRV32 (mô phỏng)', 'Nios V (DE10-Nano)'], 'CPU chạy firmware C: nạp weight và activation, cấu hình thanh ghi, bấm start, đọc kết quả. PicoRV32 trong mô phỏng, Nios V trên DE10-Nano; cùng giao diện Avalon-MM.');
  g.box(0, 500, 300, 120, 'mem', ['RAM', 'chương trình + dữ liệu', 'firmware C'], 'RAM chứa firmware, weight, ảnh và log của CPU.');
  g.arrow([[150, 365], [150, 500]], 'd', true);
  g.arrow([[300, 290], [660, 290]], 'd', true);
  g.text(480, 268, 'Avalon-MM', 'cap', 21, 'middle');
  g.text(480, 322, '32 bit · 64 KiB', 'cap', 19, 'middle');
  g.text(480, 350, 'readLatency 1', 'cap', 19, 'middle');
  g.box(660, 230, 180, 120, 'ctl', ['Giải mã', 'địa chỉ', 'avs_address'], 'Hai bit avs_address[13:12] chọn vùng: thanh ghi/QBUF, WEIGHT, ABUF hoặc CBUF.');
  g.box(900, 70, 540, 110, 'ctl', ['Thanh ghi + Sequencer', 'CTRL · STATUS · M · CYCLES · INFO', 'QMULT · QSHIFT · ACT · BIAS[j]'], 'CTRL bắt đầu một lượt chạy; M là số hàng; QMULT, QSHIFT, ACT, BIAS[j] cấu hình requant. Sequencer đưa từng hàng ABUF vào mảng và nhận kết quả.');
  g.arrow([[750, 230], [750, 125], [900, 125]], 'c');
  g.box(900, 250, 200, 90, 'mem', ['ABUF', 'INT8 · CPU ghi'], 'Bộ đệm activation INT8: CPU ghi từng hàng của ma trận A; sequencer đọc mỗi chu kỳ một hàng đưa vào sa_top.');
  g.arrow([[840, 290], [900, 290]], 'd');
  g.box(1190, 230, 250, 130, 'dp', ['sa_top', 'Systolic Array N×N', 'skew · de-skew', 'trễ 2N − 1'], 'Mảng systolic weight-stationary N×N kèm skew đầu vào và de-skew đầu ra; độ trễ từ in_valid đến out_valid là 2N − 1 chu kỳ.');
  g.arrow([[1100, 290], [1190, 290]], 'd');
  g.text(1145, 276, 'a_in', 'cap', 17, 'middle');
  g.arrow([[750, 350], [750, 395], [1240, 395], [1240, 360]], 'd');
  g.text(900, 385, 'WEIGHT · CPU ghi khi !busy', 'cap', 18);
  g.arrow([[1315, 180], [1315, 230]], 'c');
  g.text(1330, 212, 'start · M', 'cap', 17);
  g.box(1490, 230, 190, 130, 'dp', ['Cộng dồn', 'K-chunk', 'sum_row'], 'sum_row = giá trị CBUF cũ (nếu ACCUM) + c_out; cho phép chia K lớn thành nhiều lượt.');
  g.arrow([[1440, 295], [1490, 295]], 'd');
  g.box(1500, 470, 180, 90, 'mem', ['CBUF', 'INT32'], 'Bộ đệm tổng INT32: C[m][j] tại địa chỉ 0xC000 + 4·(m·N + j); CPU đọc được.');
  g.arrow([[1640, 360], [1640, 470]], 'd');
  g.box(1190, 470, 250, 120, 'dp', ['Hậu xử lý', '(acc + bias) × QMULT', '>>> QSHIFT · ACT'], 'Chạy khi CTRL.QUANT = 1: cộng bias, nhân QMULT int16, làm tròn và dịch QSHIFT, bão hòa INT8, rồi ReLU hoặc LUT sigmoid/tanh.');
  g.arrow([[1530, 360], [1530, 420], [1360, 420], [1360, 470]], 'd');
  g.box(900, 470, 200, 90, 'mem', ['QBUF', 'INT8 · CPU đọc'], 'Bộ đệm kết quả INT8 sau hậu xử lý, đọc tại 0x1000.');
  g.arrow([[1190, 530], [1100, 530]], 'd');
  g.arrow([[900, 520], [700, 520], [700, 350]], 'r');
  g.arrow([[1590, 560], [1590, 650], [700, 650], [700, 520]], 'r');
  g.text(960, 640, 'CPU đọc CBUF / QBUF (readdata)', 'cap', 18);
  g.legend();
  return g.done();
}

/* ============================================================ 4. quantization */
function dQuant() {
  var g = mk('qu'), k, xs = [0, 444, 888, 1332];
  g.box(xs[0], 20, 360, 150, 'ext', ['Mô hình float', 'model/*.npz', 'LeNet-5 · LSTM'], 'Mô hình huấn luyện ở dạng số thực trên máy tính (LeNet-5 98.83%, LSTM 97.58%).');
  g.box(xs[1], 20, 360, 150, 'dp', ['PTQ', 'scripts/quantize.py', 'đối xứng · per-tensor'], 'Post-training quantization: scale = max|w|/127 cho từng tensor, không có zero-point; weight nằm trong [−127, 127].');
  g.box(xs[2], 20, 360, 150, 'mem', ['Tham số INT8', 'fw/model_*.h', 'weight · bias · mult/shift'], 'Header C do quantize.py sinh ra: weight/bias số nguyên, mult int16 và shift ≤ 31 cho từng lớp, ảnh thử và logits golden.');
  g.box(xs[3], 20, 360, 150, 'ctl', ['Golden số nguyên', 'bit-exact', 'đối chiếu CPU và NPU'], 'Mô hình tham chiếu số nguyên làm tròn giống RTL (cộng nửa bước rồi dịch số học, rồi bão hòa). Log: mism(cpu/npu vs golden)=0/0.');
  for (k = 0; k < 3; k++) g.arrow([[xs[k] + 360, 95], [xs[k + 1], 95]], 'd');
  var x0 = 120, step = 40, n = 32, ay = 470, fy = 300;
  g.begin('grid', 'Lưới INT8', 'Mỗi giá trị thực được làm tròn tới số nguyên gần nhất rồi bão hòa trong [−128, 127]; giá trị vượt quá bị cắt về 127.', 'dp', x0 - 20, 260, 1380, 260);
  g.raw('<rect class="hit" x="' + (x0 - 20) + '" y="260" width="1380" height="260"/>');
  g.raw('<line class="axis" x1="' + x0 + '" y1="' + ay + '" x2="' + (x0 + n * step) + '" y2="' + ay + '"/>');
  for (k = 0; k <= n; k++) g.raw('<line class="tick" x1="' + (x0 + k * step) + '" y1="' + (ay - 8) + '" x2="' + (x0 + k * step) + '" y2="' + (ay + 8) + '"/>');
  var dots = [[3.3, 0], [8.6, 0], [13.2, 0], [19.7, 0], [24.4, 0], [29.1, 0], [34.6, 1]];
  dots.forEach(function (d, i) {
    var fx = x0 + d[0] * step, tgt = Math.min(n, Math.round(d[0])) * step + x0, dx = tgt - fx;
    g.raw('<circle class="fdot" cx="' + fx + '" cy="' + fy + '" r="8"/>');
    g.raw('<circle class="qdot' + (d[1] ? ' sat' : '') + '" cx="' + fx + '" cy="' + fy + '" r="8" style="--dx:' + dx + 'px;--dy:' + (ay - fy) + 'px;--d:' + (i * 0.35) + 's"/>');
  });
  g.text(x0, 285, 'x thực (float)', 'cap', 20);
  g.text(x0, ay + 44, '−128', 'cap', 20, 'middle'); g.text(x0 + n * step, ay + 44, '127', 'cap', 20, 'middle');
  g.text(x0 + n * step / 2, ay + 44, 'lưới số nguyên INT8', 'cap', 20, 'middle');
  g.text(x0 + n * step + 40, 340, 'vượt 127 →', 'warn', 19);
  g.text(x0 + n * step + 40, 366, 'bão hòa về 127', 'warn', 19);
  g.end();
  g.text(0, 640, 'Requant trong RTL:  y = clamp8( ((acc + bias) × QMULT + 2^(QSHIFT−1)) >>> QSHIFT ),  rồi ACT', 't1', 24);
  g.text(0, 678, 'QMULT là int16 có dấu, QSHIFT ≤ 31; Python và RTL làm tròn giống nhau từng bit.', 'cap', 21);
  g.legend();
  return g.done();
}

/* ============================================================ 5. PE */
function dPe() {
  var g = mk('pe');
  g.frame(330, 60, 1000, 580);
  g.text(350, 622, 'pe.sv · một processing element', 'fl', 21);
  g.text(0, 250, 'a_in', 't1', 26); g.text(0, 282, 'INT8 có dấu', 'cap', 18);
  g.arrow([[110, 262], [500, 262]], 'd');
  g.arrow([[430, 262], [430, 500], [1020, 500]], 'd');
  g.box(500, 200, 180, 124, 'dp', ['×', 'a_in × w', 'tích 16 bit'], 'Bộ nhân có dấu INT8 × INT8; kết quả được mở rộng dấu lên 32 bit trước khi cộng.');
  g.box(780, 200, 180, 124, 'dp', ['+', 'psum_in + tích', 'INT32'], 'Bộ cộng 32 bit: tổng riêng từ PE phía trên cộng với tích. 32 bit đủ rộng nên PE không cần bão hòa.');
  g.box(1050, 200, 220, 124, 'mem', ['REG', 'psum_out', 'INT32'], 'Thanh ghi tổng riêng: cập nhật ở mỗi cạnh lên của clk; đây là chỗ tạo ra độ trễ một chu kỳ cho mỗi hàng PE.');
  g.box(1020, 450, 250, 100, 'mem', ['REG', 'a_out', 'INT8'], 'Thanh ghi activation: trễ một chu kỳ rồi chuyển sang PE bên phải.');
  g.box(500, 20, 180, 80, 'ctl', ['w', 'weight INT8'], 'Weight được giữ cố định tại PE (weight-stationary), nạp từ ngoài vào qua cổng w_we của sa_top.');
  g.arrow([[590, 100], [590, 200]], 'c');
  g.box(780, 20, 180, 80, 'dp', ['psum_in', 'INT32'], 'Tổng riêng từ PE phía trên (hàng đầu nhận 0).');
  g.arrow([[870, 100], [870, 200]], 'd');
  g.arrow([[680, 262], [780, 262]], 'd');
  g.arrow([[960, 262], [1050, 262]], 'd');
  g.arrow([[1270, 262], [1560, 262]], 'd');
  g.arrow([[1270, 500], [1560, 500]], 'd');
  g.text(1400, 226, 'psum_out', 't1', 24, 'middle'); g.text(1400, 252, '→ PE phía dưới', 'cap', 18, 'middle');
  g.text(1400, 464, 'a_out', 't1', 24, 'middle'); g.text(1400, 490, '→ PE bên phải', 'cap', 18, 'middle');
  g.box(1050, 580, 220, 50, 'ctl', ['clk · rst_n'], 'Cả hai thanh ghi cập nhật ở cạnh lên của clk; rst_n bất đồng bộ xóa a_out và psum_out về 0.');
  g.text(0, 690, 'psum_out ⇐ psum_in + a_in × w', 't1', 25);
  g.text(0, 724, 'a_out ⇐ a_in (mỗi cạnh lên clk)', 't1', 25);
  g.legend();
  return g.done();
}

/* ============================================================ 6. systolic array + wavefront */
function dSa() {
  var g = mk('sa'), i, j, X0 = 340, PX = 200, Y0 = 70, PY = 130;
  g.text(X0 + 3 * PX + 75, 28, 'psum_in = 0 (hàng trên)', 'cap', 19, 'middle');
  for (i = 0; i < 4; i++) {
    var y = Y0 + i * PY;
    g.text(0, y + 50, 'a_in[' + i + ']', 'cap', 20);
    g.arrow([[90, y + 42], [118, y + 42]], 'd');
    g.box(120, y + 8, 150, 68, 'ctl', ['skew', 'D = ' + i], 'Skew: hàng i của activation bị trễ i chu kỳ để các phần tử gặp weight đúng nhịp (delay.sv).');
    g.arrow([[270, y + 42], [X0, y + 42]], 'd');
    for (j = 0; j < 4; j++) {
      var x = X0 + j * PX;
      g.box(x, y, 150, 84, 'dp', ['PE(' + i + ',' + j + ')', 'w' + i + j + ' · a×w + p'], 'PE(' + i + ',' + j + '): giữ weight w[' + i + '][' + j + '], nhân với activation đi tới và cộng vào tổng riêng chảy xuống. Sáng ở chu kỳ t = ' + (i + j) + ' của làn sóng.', { anim: 'wave', d: ((i + j) * 0.6).toFixed(2) });
      if (j < 3) g.arrow([[x + 150, y + 42], [x + PX, y + 42]], 'd');
      if (i < 3) g.arrow([[x + 75, y + 84], [x + 75, y + PY]], 'd');
    }
  }
  for (j = 0; j < 4; j++) {
    var xx = X0 + j * PX;
    g.arrow([[xx + 75, Y0 + 3 * PY + 84], [xx + 75, 618]], 'd');
    g.box(xx, 620, 150, 66, 'ctl', ['de-skew', 'D = ' + (3 - j)], 'De-skew: cột j bị trễ N−1−j chu kỳ để một hàng kết quả c_out xuất hiện thẳng hàng.');
    g.arrow([[xx + 75, 686], [xx + 75, 716]], 'd');
    g.text(xx + 75, 746, 'c_out[' + j + ']', 'cap', 20, 'middle');
  }
  for (i = 0; i < 7; i++) g.text(1240, 150, 'làn sóng: chu kỳ t = ' + i, 'wavetxt', 30, 'start', '--d:' + (i * 0.6).toFixed(2) + 's');
  g.text(1240, 215, 'PE(i,j) hoạt động ở t = i + j', 'cap', 21);
  g.text(1240, 270, 'a_out → PE phải · INT8', 'cap', 20);
  g.text(1240, 304, 'psum_out → PE dưới · INT32', 'cap', 20);
  g.text(1240, 358, 'w giữ cố định trong PE', 'cap', 20);
  g.text(1240, 392, '(weight-stationary)', 'cap', 18);
  g.text(1240, 460, 'out_valid = in_valid', 'cap', 21);
  g.text(1240, 494, 'trễ 2N − 1 chu kỳ', 'cap', 20);
  g.text(1240, 528, 'N = 4: 7 chu kỳ · N = 8: 15', 'cap', 20);
  g.text(1240, 600, 'Hình N = 4 (tổng quát N × N)', 'cap', 18);
  return g.done();
}

/* ============================================================ 7. skew / de-skew */
function dSkew() {
  var g = mk('sk'), i, k, S = 34, rowY = [60, 190, 320, 450], X0 = 40, DX = 1110;
  g.text(X0, 30, 'Skew đầu vào: hàng i trễ i chu kỳ', 'cap', 22);
  g.text(DX, 30, 'De-skew đầu ra: cột j trễ N−1−j chu kỳ', 'cap', 22);
  for (i = 0; i < 4; i++) {
    var y = rowY[i];
    g.text(X0 - 40, y + 52, 'a_in[' + i + ']', 'cap', 19);
    g.arrow([[X0 + 40, y + 46], [X0 + 100, y + 46]], 'd');
    g.begin('sk' + i, 'skew hàng ' + i, i === 0 ? 'Hàng 0 không bị trễ (D = 0): chỉ là dây nối.' : 'Hàng ' + i + ' đi qua ' + i + ' thanh ghi nối tiếp (delay.sv, D = ' + i + '): mỗi chu kỳ dữ liệu dịch một ô.', 'dp', X0 + 90, y + 10, 330, 70);
    g.raw('<rect class="hit" x="' + (X0 + 90) + '" y="' + (y + 10) + '" width="330" height="70"/>');
    if (i === 0) g.text(X0 + 160, y + 40, 'D = 0 · dây nối', 'cap', 19);
    else {
      for (k = 0; k < i; k++) g.ff(X0 + 100 + k * 56, y + 28, S, k * 0.6);
      g.text(X0 + 100, y + 20, 'D = ' + i + ' (delay, ' + i + ' FF)', 'cap', 18);
    }
    g.end();
    g.arrow([[X0 + 100 + (i ? i * 56 - 22 : 0), y + 46], [X0 + 410, y + 46]], 'd');
  }
  g.box(X0 + 410, 40, 220, 470, 'dp', ['Mảng PE', 'N × N', 'weight-stationary', 'psum ↓  ·  a →'], 'Mảng PE nhận activation đã làm lệch nhịp và trả tổng riêng ở hàng cuối của mỗi cột.');
  for (i = 0; i < 4; i++) {
    var y2 = rowY[i], d = 3 - i;
    g.arrow([[X0 + 630, y2 + 46], [DX - 20, y2 + 46]], 'd');
    g.begin('ds' + i, 'de-skew cột ' + i, d === 0 ? 'Cột 3 là cột ra muộn nhất nên không cần trễ (D = 0).' : 'Cột ' + i + ' ra sớm hơn cột cuối ' + d + ' chu kỳ nên được trễ D = ' + d + ' để cả hàng c_out căn thẳng.', 'dp', DX - 10, y2 + 10, 340, 70);
    g.raw('<rect class="hit" x="' + (DX - 10) + '" y="' + (y2 + 10) + '" width="340" height="70"/>');
    if (d === 0) g.text(DX + 20, y2 + 40, 'D = 0 · dây nối', 'cap', 19);
    else {
      for (k = 0; k < d; k++) g.ff(DX + k * 56, y2 + 28, S, k * 0.6);
      g.text(DX, y2 + 20, 'D = ' + d + ' (delay, ' + d + ' FF)', 'cap', 18);
    }
    g.end();
    g.arrow([[DX + (d ? d * 56 - 22 : -20), y2 + 46], [DX + 330, y2 + 46]], 'd');
    g.text(DX + 345, y2 + 52, 'c_out[' + i + ']', 'cap', 19);
  }
  g.text(X0 + 520, 545, 'psum cột j (INT32)', 'cap', 17, 'middle');
  g.text(0, 590, 'in_valid', 'cap', 19);
  var vx = 120, vy = 600;
  g.begin('valid', 'đường trễ valid', 'in_valid đi qua 2N − 1 thanh ghi nên out_valid chỉ lên đúng lúc một hàng c_out đầy đủ xuất hiện (N = 4: 7 chu kỳ).', 'ctl', vx, vy - 10, 520, 60);
  g.raw('<rect class="hit" x="' + vx + '" y="' + (vy - 10) + '" width="520" height="60"/>');
  for (k = 0; k < 7; k++) g.ff(vx + 40 + k * 62, vy - 4, S, k * 0.45);
  g.arrow([[vx, vy + 13], [vx + 38, vy + 13]], 'c');
  g.arrow([[vx + 40 + 6 * 62 + S, vy + 13], [vx + 40 + 7 * 62 + 20, vy + 13]], 'c');
  g.end();
  g.text(vx + 40 + 7 * 62 + 30, vy + 20, 'out_valid', 'cap', 19);
  g.text(vx + 40, vy + 62, 'delay D = 2N − 1 = 7 chu kỳ (N = 4): căn out_valid với một hàng c_out đầy đủ', 'cap', 19);
  g.text(0, 766, 'ô vuông = thanh ghi 1 chu kỳ (delay.sv), ánh sáng chạy theo hướng dữ liệu · D = 0 là dây nối', 'cap', 19);
  return g.done();
}

/* ============================================================ 8. wrapper */
function dWrap() {
  var g = mk('wr'), ys = [20, 150, 280, 410, 540];
  g.box(0, 160, 230, 330, 'ext', ['Bus Avalon-MM', 'avs_address[13:0]', 'avs_read / avs_write', 'avs_writedata', 'avs_readdata', 'waitrequest = 0'], 'Slave Avalon-MM 32 bit, địa chỉ theo word (14 bit = 64 KiB), readLatency 1, không bao giờ waitrequest.');
  g.arrow([[230, 325], [290, 325]], 'd', true);
  g.box(290, 20, 130, 620, 'ctl', ['Giải mã', 'địa chỉ', '', 'avs_address', '[13:12]', 'chọn vùng'], 'avs_address[13:12]: 0 = thanh ghi và QBUF, 1 = WEIGHT, 2 = ABUF, 3 = CBUF.');
  var regs = [
    ['0x0000  Thanh ghi', 'CTRL · STATUS · M · CYCLES', 'INFO · QMULT · QSHIFT · ACT · BIAS', 'ctl', 'CTRL (W): bit0 start, bit1 xóa done/err, bit2 ACCUM, bit3 QUANT. STATUS (R): busy, done, err. M, CYCLES, INFO, QMULT, QSHIFT, ACT, BIAS[j] ở 0x0040+4j.'],
    ['0x4000  WEIGHT  (W)', 'word i·(N/4)+q = W[i][4q..4q+3]', '', 'mem', 'Weight INT8 ghi theo word 32 bit (4 byte = 4 cột); chỉ nhận khi NPU không bận.'],
    ['0x8000  ABUF  (W)', 'hàng m của A, INT8', '', 'mem', 'Activation INT8: một hàng của A cho mỗi m; sâu tối đa DEPTH hàng; chỉ ghi khi !busy.'],
    ['0xC000  CBUF  (R)', 'INT32 C[m][j] tại 4·(m·N+j)', '', 'mem', 'Tổng INT32 chưa lượng tử hóa; CPU đọc để cộng dồn hoặc kiểm tra.'],
    ['0x1000  QBUF  (R)', 'INT8 sau requant + ACT', '', 'mem', 'Kết quả INT8 sau bias, requant và hàm kích hoạt.']
  ];
  regs.forEach(function (r, k) {
    var ln = [r[0], r[1]]; if (r[2]) ln.push(r[2]);
    g.box(480, ys[k], 400, 100, r[3], ln, r[4]);
    g.arrow(k === 3 || k === 4 ? [[480, ys[k] + 50], [420, ys[k] + 50]] : [[420, ys[k] + 50], [480, ys[k] + 50]], k === 3 || k === 4 ? 'r' : 'd');
  });
  g.box(1010, 20, 310, 100, 'ctl', ['Sequencer', 'sent / recv · busy · done · err'], 'Máy trạng thái: đọc ABUF[sent] mỗi chu kỳ, nhận kết quả theo out_valid, cộng dồn vào CBUF, rồi chạy hậu xử lý nếu QUANT.');
  g.arrow([[880, 70], [1010, 70]], 'c');
  g.box(1010, 190, 310, 200, 'dp', ['sa_top', 'Systolic Array N×N', 'skew · de-skew', 'trễ 2N − 1 chu kỳ'], 'Lõi tính toán: nhận weight từ WEIGHT và activation từ ABUF, trả c_out.');
  g.arrow([[880, 200], [1010, 230]], 'd');
  g.arrow([[880, 330], [1010, 330]], 'd');
  g.text(940, 322, 'a_in', 'cap', 17, 'middle');
  g.arrow([[1165, 120], [1165, 190]], 'c');
  g.box(1010, 450, 310, 190, 'dp', ['Cộng dồn + hậu xử lý', 'sum_row = CBUF cũ + c_out', '(sum + bias) × QMULT', '>>> QSHIFT · clamp · ACT'], 'sum_row ghi vào CBUF; khi QUANT = 1, tiếp tục bias, nhân, dịch, bão hòa rồi ACT để ghi vào QBUF.');
  g.arrow([[1165, 390], [1165, 450]], 'd');
  g.arrow([[1010, 470], [880, 470]], 'd');
  g.arrow([[1010, 600], [880, 600]], 'd');
  g.text(1370, 60, 'CTRL: start · clear', 'cap', 19);
  g.text(1370, 90, 'ACCUM: cộng vào CBUF', 'cap', 19);
  g.text(1370, 120, 'QUANT: bias + requant', 'cap', 19);
  g.text(1370, 220, 'Đọc: readdatavalid', 'cap', 19);
  g.text(1370, 250, 'trễ 1 chu kỳ sau avs_read', 'cap', 19);
  g.text(1370, 320, 'Ghi WEIGHT, ABUF chỉ', 'cap', 19);
  g.text(1370, 350, 'khi !busy', 'cap', 19);
  g.text(1370, 420, 'Cửa sổ 64 KiB,', 'cap', 19);
  g.text(1370, 450, 'địa chỉ theo word (14 bit)', 'cap', 19);
  g.legend();
  return g.done();
}

/* ============================================================ 9. post-processing */
function dPost() {
  var g = mk('po'), bw = 200, gap = 40, y = 290, h = 130, xs = [], k, sl = 0.7;
  for (k = 0; k < 7; k++) xs.push(k * (bw + gap));
  var def = [
    ['c_out[j]', 'INT32', 'từ sa_top', 'Một cột j của hàng kết quả từ mảng; mỗi cột có đường hậu xử lý riêng.'],
    ['Cộng dồn', 'sum_row =', 'CBUF cũ + c_out', 'Nếu ACCUM = 1: cộng với giá trị CBUF cũ để ghép các K-chunk; ngược lại ghi đè.'],
    ['Cộng bias', 'sum + bias[j]', 'INT32', 'Bias INT32 theo cột j, ghi ở 0x40 + 4j.'],
    ['Nhân', '× QMULT', 'prod 48 bit', 'Nhân với QMULT (int16 có dấu); tích rộng 48 bit để không tràn.'],
    ['Làm tròn + dịch', '+ 2^(QSHIFT−1)', '>>> QSHIFT', 'Cộng nửa bước rồi dịch phải số học QSHIFT (0..31): làm tròn tới số gần nhất.'],
    ['Bão hòa', 'clamp8', '[−128, 127]', 'Cắt về khoảng INT8: giá trị > 127 thành 127, < −128 thành −128.'],
    ['ACT', 'none · ReLU', 'sigmoid · tanh LUT', 'Hàm kích hoạt: 0 không, 1 ReLU, 2 sigmoid LUT, 3 tanh LUT (bảng tra).']
  ];
  def.forEach(function (d, i) { g.box(xs[i], y, bw, h, 'dp', [d[0], d[1], d[2]], d[3], { anim: 'chain', d: (i * sl).toFixed(2) }); });
  for (k = 0; k < 6; k++) g.arrow([[xs[k] + bw, y + h / 2], [xs[k + 1], y + h / 2]], 'd');
  g.box(xs[1] - 40, 60, 280, 90, 'ctl', ['CTRL.ACCUM', 'cộng CBUF cũ nếu = 1'], 'Bit ACCUM của CTRL: chọn cộng thêm CBUF cũ hay ghi đè.');
  g.arrow([[xs[1] + 100, 150], [xs[1] + 100, y]], 'c');
  g.box(xs[2] + 20, 60, 160, 90, 'mem', ['bias[j]', 'INT32 · 0x40+4j'], 'Bias INT32 do CPU ghi.');
  g.arrow([[xs[2] + 100, 150], [xs[2] + 100, y]], 'c');
  g.box(xs[3], 60, 200, 90, 'ctl', ['QMULT', 'int16 có dấu'], 'Hệ số nhân xấp xỉ real_multiplier ≈ QMULT / 2^QSHIFT, do quantize.py chọn cho từng lớp.');
  g.arrow([[xs[3] + 100, 150], [xs[3] + 100, y]], 'c');
  g.box(xs[4], 60, 200, 90, 'ctl', ['QSHIFT', '0..31'], 'Số bit dịch phải; shift lớn hơn cho độ chính xác cao hơn miễn là QMULT còn vừa int16.');
  g.arrow([[xs[4] + 100, 150], [xs[4] + 100, y]], 'c');
  g.box(xs[6], 50, 200, 100, 'ctl', ['ACT', '0 none · 1 ReLU', '2 sigmoid · 3 tanh'], 'Thanh ghi ACT chọn hàm kích hoạt.');
  g.arrow([[xs[6] + 100, 150], [xs[6] + 100, y]], 'c');
  g.box(xs[1], 560, bw, 90, 'mem', ['CBUF', 'INT32 (ghi mỗi hàng)'], 'Tổng INT32 luôn được ghi vào CBUF.');
  g.arrow([[xs[1] + 100, y + h], [xs[1] + 100, 560]], 'd');
  g.box(xs[6], 560, bw, 90, 'mem', ['QBUF', 'INT8 · CPU đọc'], 'Kết quả INT8 cuối cùng, CPU đọc tại 0x1000.');
  g.arrow([[xs[6] + 100, y + h], [xs[6] + 100, 560]], 'd');
  g.text(xs[2] - 10, 470, 'Nhánh QUANT = 1: chạy sau', 'cap', 20);
  g.text(xs[2] - 10, 500, 'khi hàng sum_row sẵn sàng', 'cap', 20);
  g.text(xs[3] + 120, 470, 'Khi QUANT = 0: chỉ ghi CBUF', 'cap', 20);
  g.text(xs[3] + 120, 500, '(INT32), bỏ qua nhánh INT8', 'cap', 20);
  g.text(xs[0], 466, 'mỗi cột j: một đường', 'cap', 18);
  g.text(xs[0], 492, 'hậu xử lý song song', 'cap', 18);
  g.legend();
  return g.done();
}

/* ============================================================ 10. verification */
function dVer() {
  var g = mk('ve'), rows = [
    ['Unit test mảng', 'Verilator · sim/tb_sa.cpp', '26 test · N = 8', 'ALL PASS', 'Mảng sa_top so với GEMM tham chiếu: kiểm tra độ trễ 2N − 1, các kiểu gap giữa các hàng và sweep ngẫu nhiên (make test N=8).'],
    ['selftest trên SoC', 'requant · accumulate · LUT', 'so với tham chiếu C', 'PASS', 'Firmware selftest chạy nhiều trial với M, ACT, QMULT, QSHIFT ngẫu nhiên và so với bản C (make soc N=8 FW=selftest).'],
    ['LeNet-5 và LSTM', 'PicoRV32 + NPU', 'mism(cpu/npu vs golden) = 0', 'PASS', 'Suy luận hoàn chỉnh trên SoC mô phỏng: kết quả CPU và NPU đều trùng golden số nguyên từng bit (make soc N=8 FW=cnn / lstm).']
  ];
  g.box(0, 250, 300, 220, 'ext', ['Golden số nguyên', 'C / Python', 'bit-exact', 'quantize.py'], 'Mô hình tham chiếu số nguyên: mọi tầng kiểm chứng đều so sánh với nó từng bit.');
  rows.forEach(function (r, i) {
    var y = 20 + i * 235;
    g.box(430, y, 680, 190, 'dp', [r[0], r[1], r[2]], r[4]);
    g.arrow([[300, 360], [380, 360], [380, y + 95], [430, y + 95]], 'c');
    g.raw('<g class="stamp" style="--d:' + (0.8 + i * 0.9) + 's"><rect x="940" y="' + (y + 14) + '" width="150" height="46" rx="3"/><text x="1015" y="' + (y + 46) + '" text-anchor="middle" font-size="24">' + r[3] + '</text></g>');
  });
  g.box(1240, 40, 460, 190, 'ctl', ['741', 'lượt gọi NPU / ảnh', 'LeNet-5 · N = 8'], 'Với N = 8, một ảnh LeNet-5 cần 741 lượt chạy NPU (calls = 741 trong log).');
  g.box(1240, 280, 460, 190, 'ctl', ['2964', 'lượt gọi NPU / ảnh', 'LeNet-5 · N = 4'], 'Mảng nhỏ hơn thì phải chia thành nhiều tile hơn: 2964 lượt với N = 4.');
  g.box(1240, 520, 460, 170, 'mem', ['RESULT: ALL PASS', 'Verilator 5.032', 'results/*.log'], 'CNN (8/8 ảnh) và LSTM (16/16) đều đúng; log nằm trong thư mục results.');
  g.text(0, 750, 'Số lượt NPU khác với số chu kỳ trên mỗi ảnh; xem slide kết quả.', 'cap', 19);
  return g.done();
}

/* ============================================================ 11. firmware: where the cycles go */
function dFw() {
  var g = mk('fw'), tot = 1923620, BW = 1500, x = 0, segs = [
    ['im2col · pooling · còn lại', 1211873, 'dp', 'Phần việc của CPU ngoài phép nhân ma trận (im2col, pooling...): hơn hai phần ba thời gian một ảnh LeNet-5.'],
    ['ghi weight', 279357, 'mem', 'CPU ghi weight vào cổng WEIGHT của wrapper mỗi lượt.'],
    ['ghi activation', 257523, 'mem', 'CPU ghi các hàng ABUF.'],
    ['chạy NPU + polling', 141576, 'ctl', 'Bấm start và poll STATUS cho đến khi done.'],
    ['đọc kết quả', 33291, 'ext', 'CPU đọc CBUF/QBUF.']
  ];
  g.text(0, 40, 'Ảnh 0 · LeNet-5 · N = 8 · tổng 1,923,620 chu kỳ', 't1', 28);
  segs.forEach(function (s, i) {
    var w = Math.max(10, BW * s[1] / tot);
    g.begin('seg' + i, s[0] + ' · ' + s[1].toLocaleString('en-US') + ' chu kỳ (' + (100 * s[1] / tot).toFixed(1) + '%)', s[3], s[2], x, 80, w, 120);
    g.raw('<rect class="seg grow" x="' + x.toFixed(1) + '" y="80" width="' + w.toFixed(1) + '" height="120" style="--d:' + (i * 0.25) + 's"/>');
    if (w > 120) g.text(x + w / 2, 150, (100 * s[1] / tot).toFixed(1) + '%', 't1', 30, 'middle');
    g.end();
    x += w;
  });
  var lx = 0;
  segs.forEach(function (s) {
    g.raw('<rect class="lg ' + s[2] + '" x="' + lx.toFixed(0) + '" y="236" width="26" height="16" rx="2"/>');
    g.text(lx + 36, 250, s[0], 'cap', 20);
    g.text(lx + 36, 278, s[1].toLocaleString('en-US'), 't2', 20);
    lx += 36 + Math.max(s[0].length * 12.2, 130) + 40;
  });
  var fy = 380, xs = [0, 440, 880, 1320], names = [
    ['CPU: im2col', 'chuẩn bị ma trận A', 'ext', 'Firmware trải phẳng ảnh/feature map thành ma trận (im2col).'],
    ['CPU: ghi', 'weight + activation', 'mem', 'nn.h chia GEMM thành tile theo N và ghi dữ liệu qua Avalon-MM.'],
    ['NPU: tính tile', 'sa_top + hậu xử lý', 'dp', 'NPU chạy từng tile; thời gian tính thực sự (npu_busy) chỉ 17,298 chu kỳ.'],
    ['CPU: đọc + pooling', 'ReLU · pooling · lớp sau', 'ext', 'CPU đọc kết quả và làm các bước còn lại trước khi sang lớp kế.']
  ];
  names.forEach(function (n, i) { g.box(xs[i], fy, 380, 120, n[2], [n[0], n[1]], n[3]); if (i < 3) g.arrow([[xs[i] + 380, fy + 60], [xs[i + 1], fy + 60]], 'd'); });
  g.arrow([[1510, fy + 120], [1510, fy + 160], [190, fy + 160], [190, fy + 120]], 'r');
  g.text(850, fy + 152, 'lặp cho 741 lượt / ảnh', 'cap', 19, 'middle');
  g.text(0, 640, 'NPU busy chỉ 17,298 chu kỳ (calls = 741); thời gian còn lại là chuẩn bị và truyền dữ liệu của CPU.', 't2', 22);
  g.text(0, 676, 'Nút thắt tiếp theo nằm ở phần việc của CPU và việc truyền dữ liệu qua bus, chưa phải ở mảng PE.', 'cap', 21);
  return g.done();
}

/* ============================================================ 12. DE10-Nano */
function dDe10() {
  var g = mk('de'), rows = [
    ['ALM', 6758, 41910, '6,758 / 41,910', 'Adaptive Logic Module: lượng logic dùng của Cyclone V 5CSEBA6U23I7.'],
    ['DSP', 51, 112, '51 / 112', 'Khối DSP: các bộ nhân INT8 của mảng PE được ánh xạ vào đây.'],
    ['Bit bộ nhớ', 2433272, 5662720, '2,433,272 / 5,662,720', 'Bit nhớ M10K dành cho ABUF, CBUF, QBUF và bộ nhớ của Nios V.']
  ], BW = 900;
  rows.forEach(function (r, i) {
    var y = 60 + i * 150, p = r[1] / r[2];
    g.begin('g' + i, r[0] + ' · ' + r[3] + ' (' + Math.round(100 * p) + '%)', r[4], 'dp', 0, y, BW + 300, 90);
    g.raw('<rect class="hit" x="0" y="' + y + '" width="' + (BW + 300) + '" height="90"/>');
    g.text(0, y + 20, r[0], 't1', 28);
    g.text(BW + 10, y + 20, Math.round(100 * p) + '%', 't1', 34, 'end');
    g.raw('<rect class="gbg" x="0" y="' + (y + 34) + '" width="' + BW + '" height="40"/>');
    g.raw('<rect class="gfill grow" x="0" y="' + (y + 34) + '" width="' + (BW * p).toFixed(1) + '" height="40" style="--d:' + (i * 0.3) + 's"/>');
    g.text(BW + 30, y + 64, r[3], 'cap', 20);
    g.end();
  });
  g.box(0, 510, 430, 110, 'mem', ['8,603', 'thanh ghi (registers)'], 'Số thanh ghi do Quartus báo cáo ở bản Nios V/g.');
  g.box(470, 510, 430, 110, 'ext', ['Nios V/g', 'Cyclone V 5CSEBA6U23I7'], 'Biến thể CPU Nios V/g trên DE10-Nano; HPS ARM không được sử dụng.');
  g.begin('fmax', 'Fmax 72.56 MHz', 'Fmax của CLOCK_50 ở góc slow 100°C theo báo cáo Quartus; đạt timing ở clock mục tiêu 50 MHz.', 'ctl', 1250, 60, 440, 420);
  g.raw('<rect x="1250" y="60" width="440" height="420" rx="4"/>');
  g.text(1470, 200, '72.56', 'big', 110, 'middle');
  g.text(1470, 250, 'MHz · Fmax', 't1', 30, 'middle');
  g.text(1470, 300, 'CLOCK_50 · slow 100°C', 'cap', 21, 'middle');
  g.text(1470, 390, 'đạt timing ở 50 MHz', 'cap', 22, 'middle');
  g.text(1470, 430, 'Quartus Prime Lite', 'cap', 19, 'middle');
  g.end();
  g.text(0, 700, 'Đã fit và đạt timing; chưa chạy trên board vật lý và chưa đo công suất (chưa có số watt hay joule/ảnh).', 'warn', 21);
  return g.done();
}

/* ============================================================ 13. accuracy */
function dAcc() {
  var g = mk('ac'), BASE = 96, TOP = 100, BH = 500, y0 = 580, bw = 190, data = [
    ['LeNet-5', 98.83, 98.85, 'LeNet-5: INT8 98.85% so với float 98.83% trên 10k ảnh MNIST test (chênh +0.02 điểm).'],
    ['LSTM', 97.58, 97.50, 'LSTM: INT8 97.50% so với float 97.58% (chênh −0.08 điểm); số liệu LSTM lấy từ README.']
  ];
  [0, 1, 2, 3, 4].forEach(function (k) {
    var yy = y0 - BH * k / 4;
    g.raw('<line class="axis grid" x1="60" y1="' + yy + '" x2="1100" y2="' + yy + '"/>');
    g.text(48, yy + 6, (BASE + k).toString() + '%', 'cap', 19, 'end');
  });
  data.forEach(function (d, i) {
    var gx = 120 + i * 500;
    [[d[1], 'float', 'dp'], [d[2], 'INT8', 'ctl']].forEach(function (v, k) {
      var hh = BH * (v[0] - BASE) / (TOP - BASE), x = gx + k * (bw + 30);
      g.begin('a' + i + k, d[0] + ' · ' + v[1] + ' ' + v[0].toFixed(2) + '%', d[3], v[2], x, y0 - hh, bw, hh);
      g.raw('<rect class="bar growy" x="' + x + '" y="' + (y0 - hh).toFixed(1) + '" width="' + bw + '" height="' + hh.toFixed(1) + '" style="--d:' + (i * 0.3 + k * 0.15) + 's"/>');
      g.text(x + bw / 2, y0 - hh - 14, v[0].toFixed(2) + '%', 't1', 30, 'middle');
      g.text(x + bw / 2, y0 + 34, v[1], 'cap', 22, 'middle');
      g.end();
    });
    g.text(gx + bw + 15, y0 + 78, d[0], 't1', 26, 'middle');
  });
  g.text(1230, 150, 'LeNet-5', 't1', 28); g.text(1230, 190, 'INT8 − float = +0.02 điểm %', 'cap', 22);
  g.text(1230, 270, 'LSTM', 't1', 28); g.text(1230, 310, 'INT8 − float = −0.08 điểm %', 'cap', 22);
  g.text(1230, 420, 'Hai mô hình giữ độ chính xác', 't2', 21);
  g.text(1230, 452, 'sát float sau lượng tử hóa.', 't2', 21);
  g.text(1230, 520, 'Không suy ra cho mọi mạng', 'warn', 20); g.text(1230, 548, 'hay mọi tập dữ liệu.', 'warn', 20);
  g.text(0, 700, 'Lưu ý: trục dọc bắt đầu từ 96% để thấy chênh lệch; đánh giá trên 10k ảnh MNIST test.', 'cap', 20);
  return g.done();
}

/* ============================================================ 14. cycles */
function dCyc() {
  var g = mk('cy'), BW = 1000, groups = [
    ['CNN · LeNet-5 · N = 8', [['CPU', 13254324, 13254324, 'ext'], ['NPU', 1923665, 13254324, 'dp']], '6.9×', 'LeNet-5: 1,923,665 chu kỳ/ảnh với NPU so với 13,254,324 chu kỳ/ảnh chỉ dùng CPU (results/cnn_N8.log).'],
    ['LSTM · batch = 1', [['CPU', 3559094, 3559094, 'ext'], ['NPU', 1068230, 3559094, 'dp']], '3.3×', 'LSTM batch = 1: 1,068,230 so với 3,559,094 chu kỳ/ảnh (results/lstm_N8.log).'],
    ['LSTM · batch = 16', [['CPU', 3559094, 3559094, 'ext'], ['NPU', 217262, 3559094, 'dp']], '16.4×', 'Gộp 16 chuỗi cho cùng một lần nạp weight: 217,262 chu kỳ/ảnh, nhanh hơn CPU 16.4× (results/lstm_N8.log).']
  ];
  groups.forEach(function (gr, i) {
    var y = 20 + i * 235;
    g.text(0, y + 28, gr[0], 't1', 27);
    gr[1].forEach(function (b, k) {
      var by = y + 50 + k * 70, w = Math.max(6, (BW - 260) * b[1] / b[2]);
      g.begin('c' + i + k, gr[0] + ' · ' + b[0] + ' ' + b[1].toLocaleString('en-US') + ' chu kỳ/ảnh', gr[3], b[3], 0, by, BW + 100, 56);
      g.raw('<rect class="hit" x="0" y="' + by + '" width="' + (BW + 100) + '" height="56"/>');
      g.text(0, by + 38, b[0], 'cap', 22);
      g.raw('<rect class="bar2 ' + b[3] + ' grow" x="80" y="' + by + '" width="' + w.toFixed(1) + '" height="56" style="--d:' + (i * 0.25 + k * 0.2) + 's"/>');
      g.text(80 + w + 16, by + 38, b[1].toLocaleString('en-US'), 't1', 24);
      g.end();
    });
    g.begin('x' + i, gr[2] + ' nhanh hơn CPU', gr[3], 'ctl', 1230, y + 10, 460, 170);
    g.raw('<rect x="1230" y="' + (y + 10) + '" width="460" height="170" rx="4"/>');
    g.text(1460, y + 110, gr[2], 'big', 84, 'middle');
    g.text(1460, y + 152, 'so với CPU', 'cap', 21, 'middle');
    g.end();
  });
  g.text(0, 745, 'Mỗi nhóm lấy chu kỳ CPU làm 100%; số chu kỳ trên mỗi ảnh từ log mô phỏng PicoRV32, không phải đo trên board.', 'cap', 19);
  return g.done();
}

/* ============================================================ 15. demo (real log lines) */
function dDemo() {
  var g = mk('dm'), L = [
    ['p', '$ make soc N=8 FW=cnn'],
    ['n', 'LeNet-5 INT8, N=8'],
    ['n', 'img 0 label=7 pred=7 cpu_cyc=13254614 npu_cyc=1923620 npu_busy=17298 calls=741 mism(cpu/npu vs golden)=0/0'],
    ['n', 'img 1 label=2 pred=2 cpu_cyc=13253922 npu_cyc=1923734 npu_busy=17298 calls=741 mism(cpu/npu vs golden)=0/0'],
    ['n', 'avg cpu_cyc=13254324 avg npu_cyc=1923665 speedup_x100=689 npu_busy_share_x100=89'],
    ['n', 'correct=8/8'],
    ['ok', 'RESULT: ALL PASS'],
    ['p', '$ make soc N=8 FW=lstm'],
    ['n', 'cpu_only batch=1   cycles/img=3559094'],
    ['n', 'npu batch=1        cycles/img=1068230 npu_busy/img=23142 calls/img=1348 correct=16/16'],
    ['n', 'npu batch=16       cycles/img=217262 npu_busy/img=2710 calls total=1348 correct=16/16'],
    ['n', 'speedup_x100 vs cpu: batch1=333 batchN=1638'],
    ['n', 'mismatches vs golden: 0'],
    ['ok', 'RESULT: ALL PASS']
  ];
  g.raw('<rect class="term" x="0" y="0" width="1700" height="700" rx="4"/>');
  g.raw('<text x="24" y="38" class="cap" font-size="19">results/cnn_N8.log · results/lstm_N8.log (trích nguyên văn, Verilator 5.032)</text>');
  L.forEach(function (l, i) {
    g.raw('<text class="tl ' + l[0] + '" x="24" y="' + (84 + i * 44) + '" font-size="22" style="--d:' + (0.5 + i * 0.5).toFixed(2) + 's">' + esc(l[1]) + '</text>');
  });
  g.text(0, 745, 'Mọi suy luận của CPU và NPU đều trùng golden số nguyên: mismatches = 0.', 't2', 22);
  return g.done();
}

/* ============================================================ 16. conclusion */
function dEnd() {
  var g = mk('en');
  g.box(0, 20, 540, 250, 'dp', ['Độ chính xác', 'INT8 gần float', 'LeNet 98.85% · LSTM 97.50%'], 'LeNet-5 INT8 98.85% (float 98.83%), LSTM INT8 97.50% (float 97.58%).', { s: 1.35 });
  g.box(580, 20, 540, 250, 'dp', ['Tốc độ (chu kỳ)', 'CNN 6.9× · LSTM 3.3× – 16.4×', 'PicoRV32 mô phỏng, N = 8'], 'Số chu kỳ trên mỗi ảnh theo log mô phỏng; LSTM 16.4× khi gộp batch 16.', { s: 1.35 });
  g.box(1160, 20, 540, 250, 'dp', ['DE10-Nano', 'ALM 16% · DSP 46% · 72.56 MHz', 'Nios V/g · đạt timing'], 'Kết quả fit Quartus cho Cyclone V; chưa chạy trên board.', { s: 1.35 });
  g.text(0, 340, 'Hạn chế', 't1', 30);
  g.box(0, 370, 540, 150, 'ctl', ['CPU là nút thắt', 'im2col + pooling = 63% chu kỳ CNN'], 'Phần việc của CPU chiếm 1,211,873 trong 1,923,620 chu kỳ của ảnh 0.', { s: 1.2 });
  g.box(580, 370, 540, 150, 'ctl', ['Chưa đo trên board', 'chưa có công suất, joule/ảnh'], 'Hệ thống đã fit và đạt timing nhưng chưa chạy trên phần cứng thật.', { s: 1.2 });
  g.box(1160, 370, 540, 150, 'ctl', ['Chưa so với ARM/x86', 'chỉ so với PicoRV32'], 'Chưa có benchmark CPU ARM Cortex hay x86 trong repo.', { s: 1.2 });
  g.text(0, 590, 'Hướng tiếp theo', 't1', 30);
  g.box(0, 620, 540, 110, 'mem', ['Chuyển im2col sang phần cứng', 'giảm tải CPU và bus'], 'Giảm thời gian chuẩn bị dữ liệu của CPU, nút thắt hiện tại.', { s: 1.1 });
  g.box(580, 620, 540, 110, 'mem', ['Chạy và đo trên DE10-Nano', 'công suất · năng lượng'], 'Nạp bitstream, đo thời gian thật và công suất.', { s: 1.1 });
  g.box(1160, 620, 540, 110, 'mem', ['Tối ưu dataflow', 'sparsity · double buffering'], 'Hướng mở rộng: tái sử dụng dữ liệu và chồng lấn truyền/tính.', { s: 1.1 });
  return g.done();
}

/* ============================================================ 17. references */
function dRef() {
  var g = mk('rf');
  g.box(0, 40, 800, 130, 'ext', ['Báo cáo cuối kỳ Nhóm 5 · EE5223', 'cấu trúc, mục tiêu, phương pháp'], 'Báo cáo Word và bản LaTeX của nhóm (thư mục tex/).');
  g.box(900, 40, 800, 130, 'ext', ['README.md', 'kiến trúc · lệnh chạy · LSTM 97.50%'], 'README của repository: kiến trúc, bản đồ thanh ghi, lệnh make và bảng kết quả.');
  g.box(0, 230, 800, 130, 'mem', ['results/cnn_N8.log · lstm_N8.log', 'chu kỳ CNN, LSTM · mismatch = 0'], 'Hai log mô phỏng là nguồn của mọi số chu kỳ trong bài.');
  g.box(900, 230, 800, 130, 'mem', ['de10/reports', 'fit report · fmax'], 'Báo cáo Quartus của biến thể Nios V/g trên DE10-Nano.');
  g.box(0, 420, 800, 130, 'dp', ['rtl/ · sim/ · soc/ · fw/ · scripts/', 'RTL, testbench, firmware, quantize.py'], 'Toàn bộ mã nguồn có chú thích tiếng Việt.');
  g.box(900, 420, 800, 130, 'dp', ['github.com/HThanh-how/EE5223_Fri', 'hthanh-how.github.io/EE5223_Fri'], 'Repository và trang slide này.');
  g.text(0, 640, 'Cảm ơn thầy và các bạn đã lắng nghe.', 't1', 34);
  g.text(0, 690, 'Phạm Tuấn An · Phạm Huy Thanh · Vũ Tiến Giang — GVHD Trương Quang Vinh', 'cap', 22);
  return g.done();
}

/* ============================================================ slide list */
var O = window.SLIDES;   /* old 14 slides from content.js: title, goal, soc, quant, pe, array, verify, firmware, de10, acc, cyc, demo, end, refs */
function dia(title, lines, notes, svg) { return { title: title, short: title, lines: lines, notes: notes, plan: 60, kind: 'trace', dia: true, svg: svg }; }
var first = O[0]; first.kind = 'trace';
window.SLIDES = [first,
  dia('Mọi phép nhân ma trận của CNN và LSTM đi qua một NPU', ['Rê chuột vào một khối để xem chi tiết · nguồn: scripts/quantize.py, fw/nn.h'], O[1].notes, dGemm()),
  dia('CPU điều khiển NPU qua Avalon-MM', ['Nguồn RTL: soc/soc_top.sv, rtl/npu_avmm.sv, rtl/sa_top.sv'], O[2].notes, dSys()),
  dia('Lượng tử hóa đưa mô hình về INT8 mà vẫn khớp từng bit', ['Nguồn: scripts/quantize.py · requant trong rtl/npu_avmm.sv'], O[3].notes, dQuant()),
  dia('PE: một phép nhân, một phép cộng, hai thanh ghi', ['Nguồn RTL: rtl/pe.sv'], O[4].notes, dPe()),
  dia('Systolic Array: làn sóng dữ liệu đi qua lưới PE', ['Nguồn RTL: rtl/sa_top.sv · độ trễ 2N − 1: N = 4 là 7 chu kỳ, N = 8 là 15 chu kỳ'], O[5].notes, dSa()),
  dia('Skew và de-skew: căn nhịp bằng các đường trễ', ['Nguồn RTL: rtl/delay.sv, rtl/sa_top.sv · hàng i trễ i, cột j trễ N−1−j, valid trễ 2N−1'],
    'Để các phần tử cùng một hàng của ma trận A gặp đúng weight tại đúng chu kỳ, hàng i được làm trễ i chu kỳ bằng chuỗi thanh ghi. Ở đầu ra, cột j bị trễ N trừ một trừ j chu kỳ để một hàng kết quả c_out được căn thẳng hàng. Tín hiệu valid đi qua đường trễ hai N trừ một chu kỳ, vì vậy out_valid đánh dấu đúng thời điểm một hàng kết quả đầy đủ xuất hiện. Với N bằng bốn là bảy chu kỳ.', dSkew()),
  dia('Wrapper Avalon-MM: bản đồ thanh ghi, bộ đệm và sequencer', ['Nguồn RTL: rtl/npu_avmm.sv · địa chỉ word 14 bit, readLatency 1, không waitrequest'],
    'Wrapper npu_avmm là slave Avalon-MM. Hai bit cao của địa chỉ chọn vùng: thanh ghi điều khiển ở không, QBUF ở 0x1000, WEIGHT ở 0x4000, ABUF ở 0x8000 và CBUF ở 0xC000. Sequencer đọc từng hàng ABUF đưa vào sa_top, nhận kết quả, cộng dồn theo K-chunk vào CBUF và, khi bit QUANT bật, chạy tiếp bias, requant và hàm kích hoạt vào QBUF. Ghi WEIGHT và ABUF chỉ được chấp nhận khi NPU không bận.', dWrap()),
  dia('Hậu xử lý: từ tổng INT32 về kết quả INT8', ['Nguồn RTL: rtl/npu_avmm.sv · y = clamp8(((acc + bias) × QMULT + 2^(QSHIFT−1)) >>> QSHIFT), rồi ACT'],
    'Khối hậu xử lý chạy cho mỗi cột kết quả. Đầu tiên cộng dồn theo K-chunk với giá trị CBUF cũ nếu bit ACCUM bật, sau đó cộng bias, nhân với QMULT là số nguyên 16 bit có dấu, cộng hằng làm tròn rồi dịch phải QSHIFT, bão hòa về khoảng âm 128 đến 127. Cuối cùng là hàm kích hoạt: không có, ReLU, hoặc tra bảng sigmoid hoặc tanh. Kết quả INT8 ghi vào QBUF, còn tổng INT32 luôn được ghi vào CBUF.', dPost()),
  dia('Ba tầng kiểm chứng cùng đối chiếu golden số nguyên', ['Nguồn: results/test_N8.log, selftest_N8.log, cnn_N8.log · lệnh make trong README.md'], O[6].notes, dVer()),
  dia('Firmware: CPU chiếm hơn hai phần ba chu kỳ của CNN', ['Nguồn: results/cnn_N8.log (profile img0) · im2col, pooling và ghi dữ liệu chạy trên CPU'], O[7].notes, dFw()),
  dia('DE10-Nano: đạt timing, dùng 16% ALM và 46% DSP', ['Nguồn: de10/reports (Nios V/g) · fmax.txt, *.fit.rpt'], O[8].notes, dDe10()),
  dia('INT8 giữ độ chính xác gần float', ['Nguồn: model/ (LeNet), README.md (LSTM)'], O[9].notes, dAcc()),
  dia('NPU giảm chu kỳ suy luận: 6.9× cho CNN, đến 16.4× cho LSTM', ['Nguồn: results/cnn_N8.log, results/lstm_N8.log (PicoRV32 mô phỏng, N = 8)'],
    'Log CNN và LSTM trên cấu hình N bằng tám cung cấp số chu kỳ trên mỗi ảnh cho cả NPU và CPU. CNN dùng 1,923,665 chu kỳ với NPU so với 13,254,324 chu kỳ với CPU, nhanh hơn khoảng 6.9 lần. Với LSTM batch bằng một, hai giá trị là 1,068,230 và 3,559,094, tương đương 3.3 lần; gộp batch 16 còn 217,262 chu kỳ trên mỗi ảnh, nhanh 16.4 lần. Đây là chu kỳ mô phỏng PicoRV32.', dCyc()),
  dia('Demo: log mô phỏng SoC đều đúng từng bit', ['Trích nguyên văn từ results/cnn_N8.log và lstm_N8.log'], O[11].notes, dDemo()),
  dia('Kết luận: NPU INT8 chính xác, nhanh hơn CPU, vừa DE10-Nano', ['Hạn chế nêu rõ: chưa chạy board, chưa đo công suất, chưa so với ARM/x86'], O[12].notes, dEnd()),
  dia('Nguồn kết quả có thể đối chiếu', ['Repo: github.com/HThanh-how/EE5223_Fri'], O[13].notes, dRef())
];

/* ---------------------------------------------------------------- hover: highlight block + wires, show explanation */
var TIP0 = 'Rê chuột vào một khối để xem chi tiết.';
function clear(svg) {
  svg.classList.remove('hov');
  svg.querySelectorAll('.hot,.nb').forEach(function (e) { e.classList.remove('hot'); e.classList.remove('nb'); });
}
document.addEventListener('mouseover', function (e) {
  var wrap = e.target.closest ? e.target.closest('.dwrap') : null;
  if (!wrap) return;
  var b = e.target.closest('.bx');
  var svg = wrap.querySelector('.dsvg'), tip = wrap.querySelector('.tip');
  clear(svg);
  if (!b) { tip.innerHTML = '<i>' + TIP0 + '</i>'; return; }
  var id = b.getAttribute('data-id');
  svg.classList.add('hov'); b.classList.add('hot');
  svg.querySelectorAll('.aw').forEach(function (a) {
    var f = a.getAttribute('data-f'), t = a.getAttribute('data-t');
    if (f === id || t === id) {
      a.classList.add('hot');
      var other = f === id ? t : f;
      if (other) svg.querySelectorAll('.bx[data-id="' + other + '"]').forEach(function (n) { n.classList.add('nb'); });
    }
  });
  tip.textContent = '';
  var bold = document.createElement('b'); bold.textContent = b.getAttribute('data-n');
  tip.appendChild(bold); tip.appendChild(document.createTextNode(' ' + b.getAttribute('data-i')));
}, true);
})();
