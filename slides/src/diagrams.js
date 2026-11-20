/* Five block-diagram slides (inline SVG, vector, animated data flow) derived from the RTL:
   rtl/pe.sv, rtl/delay.sv, rtl/sa_top.sv, rtl/npu_avmm.sv, soc/soc_top.sv.
   Also tags every slide with a 3D scene "kind" and splices the diagram slides into SLIDES. */
(function () {
'use strict';
var W = 1700, H = 780;
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function fit(t, w, max) { return Math.max(13, Math.min(max, (w - 18) / (0.6 * t.length))); }

/* one diagram = list of svg fragments + unique marker ids */
function mk(id) {
  var o = [];
  var api = {
    /* box: x,y,w,h, class (dp|ctl|mem|ext), lines[] (first one bold) */
    box: function (x, y, w, h, cls, lines, name) {
      var n = lines.length, g = '<g class="bx ' + cls + '" data-n="' + esc(name || lines[0]) + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3"/>';
      var gap = 29, y0 = y + h / 2 - (n - 1) * gap / 2 + 7;
      lines.forEach(function (t, k) {
        g += '<text x="' + (x + w / 2) + '" y="' + (y0 + k * gap).toFixed(1) + '" text-anchor="middle" class="' + (k ? 't2' : 't1') + '" font-size="' + fit(t, w, k ? 19 : 24).toFixed(1) + '">' + esc(t) + '</text>';
      });
      o.push(g + '</g>');
    },
    /* arrow along points [[x,y],...]; kind: d (data) | c (control) | r (read, dashed); both: arrowheads on both ends */
    arrow: function (pts, kind, both) {
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
      o.push('<path class="ar ' + (kind || 'd') + '" d="' + d + '" marker-end="url(#' + id + (kind === 'c' ? 'c' : 'd') + ')"' + (both ? ' marker-start="url(#' + id + (kind === 'c' ? 'c' : 'd') + 's)"' : '') + '/>');
    },
    text: function (x, y, t, cls, size, anchor) {
      o.push('<text x="' + x + '" y="' + y + '" class="' + (cls || 'cap') + '" font-size="' + (size || 20) + '" text-anchor="' + (anchor || 'start') + '">' + esc(t) + '</text>');
    },
    frame: function (x, y, w, h, label) {
      o.push('<rect class="frame" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4"/>');
      if (label) o.push('<text x="' + (x + 18) + '" y="' + (y + 32) + '" class="fl" font-size="21">' + esc(label) + '</text>');
    },
    ff: function (x, y, s) { o.push('<rect class="ff" x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '"/>'); },
    raw: function (s) { o.push(s); },
    legend: function () {
      var items = [['dp', 'datapath'], ['ctl', 'điều khiển'], ['mem', 'bộ nhớ'], ['ext', 'ngoài khối']], x = 0;
      items.forEach(function (it) {
        o.push('<rect class="lg ' + it[0] + '" x="' + x + '" y="752" width="26" height="16" rx="2"/><text x="' + (x + 36) + '" y="766" class="cap" font-size="19">' + it[1] + '</text>');
        x += 36 + it[1].length * 11.6 + 40;
      });
    },
    done: function () {
      var defs = '<defs>' + ['d', 'c'].map(function (k) {
        return '<marker id="' + id + k + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" class="mk ' + k + '"/></marker>' +
          '<marker id="' + id + k + 's" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mk ' + k + '"/></marker>';
      }).join('') + '</defs>';
      return '<svg class="dsvg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' + defs + o.join('') + '</svg>';
    }
  };
  return api;
}

/* ---------------------------------------------------------------- 1. system */
function dSys() {
  var g = mk('sy');
  g.frame(620, 10, 1080, 720, 'npu_avmm · wrapper Avalon-MM slave');
  g.box(0, 215, 300, 150, 'ext', ['CPU RISC-V', 'PicoRV32 (mô phỏng)', 'Nios V (DE10-Nano)']);
  g.box(0, 500, 300, 120, 'mem', ['RAM', 'chương trình + dữ liệu', 'firmware C']);
  g.arrow([[150, 365], [150, 500]], 'd', true);
  g.arrow([[300, 290], [660, 290]], 'd', true);
  g.text(480, 268, 'Avalon-MM', 'cap', 21, 'middle');
  g.text(480, 322, '32 bit · 64 KiB', 'cap', 19, 'middle');
  g.text(480, 350, 'readLatency 1', 'cap', 19, 'middle');
  g.box(660, 230, 180, 120, 'ctl', ['Giải mã', 'địa chỉ', 'avs_address']);
  g.box(900, 70, 540, 110, 'ctl', ['Thanh ghi + Sequencer', 'CTRL · STATUS · M · CYCLES · INFO', 'QMULT · QSHIFT · ACT · BIAS[j]']);
  g.arrow([[750, 230], [750, 125], [900, 125]], 'c');
  g.box(900, 250, 200, 90, 'mem', ['ABUF', 'INT8 · CPU ghi']);
  g.arrow([[840, 290], [900, 290]], 'd');
  g.box(1190, 230, 250, 130, 'dp', ['sa_top', 'Systolic Array N×N', 'skew · de-skew', 'trễ 2N − 1']);
  g.arrow([[1100, 290], [1190, 290]], 'd');
  g.text(1145, 276, 'a_in', 'cap', 17, 'middle');
  g.arrow([[750, 350], [750, 395], [1240, 395], [1240, 360]], 'd');
  g.text(900, 385, 'WEIGHT · CPU ghi khi !busy', 'cap', 18);
  g.arrow([[1315, 180], [1315, 230]], 'c');
  g.text(1330, 212, 'start · M', 'cap', 17);
  g.box(1490, 230, 190, 130, 'dp', ['Cộng dồn', 'K-chunk', 'sum_row']);
  g.arrow([[1440, 295], [1490, 295]], 'd');
  g.box(1500, 470, 180, 90, 'mem', ['CBUF', 'INT32']);
  g.arrow([[1640, 360], [1640, 470]], 'd');
  g.box(1190, 470, 250, 120, 'dp', ['Hậu xử lý', '(acc + bias) × QMULT', '>>> QSHIFT · ACT']);
  g.arrow([[1530, 360], [1530, 420], [1360, 420], [1360, 470]], 'd');
  g.box(900, 470, 200, 90, 'mem', ['QBUF', 'INT8 · CPU đọc']);
  g.arrow([[1190, 530], [1100, 530]], 'd');
  g.arrow([[900, 520], [700, 520], [700, 350]], 'r');
  g.arrow([[1590, 560], [1590, 650], [700, 650], [700, 520]], 'r');
  g.text(960, 640, 'CPU đọc CBUF / QBUF (readdata)', 'cap', 18);
  g.legend();
  return g.done();
}

/* ---------------------------------------------------------------- 2. systolic array */
function dSa() {
  var g = mk('sa'), i, j, X0 = 340, PX = 200, Y0 = 70, PY = 130;
  g.text(X0 + 3 * PX + 75, 28, 'psum_in = 0 (hàng trên)', 'cap', 19, 'middle');
  for (i = 0; i < 4; i++) {
    var y = Y0 + i * PY;
    g.text(0, y + 50, 'a_in[' + i + ']', 'cap', 20);
    g.arrow([[90, y + 42], [118, y + 42]], 'd');
    g.box(120, y + 8, 150, 68, 'ctl', ['skew', 'D = ' + i], 'skew' + i);
    g.arrow([[270, y + 42], [X0, y + 42]], 'd');
    for (j = 0; j < 4; j++) {
      var x = X0 + j * PX;
      g.box(x, y, 150, 84, 'dp', ['PE(' + i + ',' + j + ')', 'w' + i + j + ' · a×w + p'], 'PE' + i + j);
      if (j < 3) g.arrow([[x + 150, y + 42], [x + PX, y + 42]], 'd');
      if (i < 3) g.arrow([[x + 75, y + 84], [x + 75, y + PY]], 'd');
    }
  }
  for (j = 0; j < 4; j++) {
    var xx = X0 + j * PX;
    g.arrow([[xx + 75, Y0 + 3 * PY + 84], [xx + 75, 618]], 'd');
    g.box(xx, 620, 150, 66, 'ctl', ['de-skew', 'D = ' + (3 - j)], 'deskew' + j);
    g.arrow([[xx + 75, 686], [xx + 75, 716]], 'd');
    g.text(xx + 75, 746, 'c_out[' + j + ']', 'cap', 20, 'middle');
  }
  g.text(1240, 168, 'a_out → PE phải', 'cap', 21);
  g.text(1240, 200, 'INT8, dịch ngang 1 chu kỳ', 'cap', 18);
  g.text(1240, 270, 'psum_out → PE dưới', 'cap', 21);
  g.text(1240, 302, 'INT32, = psum_in + a_in × w', 'cap', 18);
  g.text(1240, 372, 'w giữ cố định trong PE', 'cap', 21);
  g.text(1240, 404, 'weight-stationary (nạp từ w_we)', 'cap', 18);
  g.text(1240, 474, 'out_valid = in_valid', 'cap', 21);
  g.text(1240, 506, 'trễ 2N − 1 chu kỳ', 'cap', 18);
  g.text(1240, 580, 'Hình: N = 4 (tổng quát N × N)', 'cap', 18);
  g.raw('<text x="1700" y="766" class="cap" font-size="19" text-anchor="end">datapath · điều khiển (skew / de-skew)</text>');
  return g.done();
}

/* ---------------------------------------------------------------- 3. skew / de-skew */
function dSkew() {
  var g = mk('sk'), i, k, S = 34, rowY = [60, 190, 320, 450], X0 = 40;
  g.text(X0, 30, 'Skew đầu vào: hàng i trễ i chu kỳ', 'cap', 22);
  g.text(1110, 30, 'De-skew đầu ra: cột j trễ N−1−j chu kỳ', 'cap', 22);
  for (i = 0; i < 4; i++) {
    var y = rowY[i];
    g.text(X0 - 40, y + 52, 'a_in[' + i + ']', 'cap', 19);
    g.arrow([[X0 + 40, y + 46], [X0 + 100, y + 46]], 'd');
    if (i === 0) {
      g.text(X0 + 160, y + 40, 'D = 0 · dây nối', 'cap', 19);
      g.arrow([[X0 + 100, y + 46], [X0 + 410, y + 46]], 'd');
    } else {
      for (k = 0; k < i; k++) g.ff(X0 + 100 + k * 56, y + 28, S);
      g.text(X0 + 100, y + 20, 'D = ' + i + ' (delay, ' + i + ' FF)', 'cap', 18);
      g.arrow([[X0 + 100 + i * 56 - 22, y + 46], [X0 + 410, y + 46]], 'd');
    }
  }
  g.box(X0 + 410, 40, 220, 470, 'dp', ['Mảng PE', 'N × N', 'weight-stationary', 'psum ↓  ·  a →']);
  var DX = 1110;
  for (i = 0; i < 4; i++) {
    var y2 = rowY[i], d = 3 - i;
    g.arrow([[X0 + 630, y2 + 46], [DX - 20, y2 + 46]], 'd');
    if (d === 0) {
      g.text(DX + 20, y2 + 40, 'D = 0 · dây nối', 'cap', 19);
      g.arrow([[DX - 20, y2 + 46], [DX + 330, y2 + 46]], 'd');
    } else {
      for (k = 0; k < d; k++) g.ff(DX + k * 56, y2 + 28, S);
      g.text(DX, y2 + 20, 'D = ' + d + ' (delay, ' + d + ' FF)', 'cap', 18);
      g.arrow([[DX + d * 56 - 22, y2 + 46], [DX + 330, y2 + 46]], 'd');
    }
    g.text(DX + 345, y2 + 52, 'c_out[' + i + ']', 'cap', 19);
  }
  g.text(X0 + 520, 545, 'psum cột j (INT32)', 'cap', 17, 'middle');
  /* valid line */
  g.text(0, 590, 'in_valid', 'cap', 19);
  var vx = 120, vy = 600;
  for (k = 0; k < 7; k++) g.ff(vx + 40 + k * 62, vy - 4, S);
  g.arrow([[vx, vy + 13], [vx + 38, vy + 13]], 'c');
  g.arrow([[vx + 40 + 6 * 62 + S, vy + 13], [vx + 40 + 7 * 62 + 20, vy + 13]], 'c');
  g.text(vx + 40 + 7 * 62 + 30, vy + 20, 'out_valid', 'cap', 19);
  g.text(vx + 40, vy + 62, 'delay D = 2N − 1 = 7 chu kỳ (N = 4): căn out_valid với một hàng c_out đầy đủ', 'cap', 19);
  g.raw('<text x="0" y="766" class="cap" font-size="19">ô vuông = thanh ghi 1 chu kỳ (delay.sv) · D = 0 là dây nối</text>');
  return g.done();
}

/* ---------------------------------------------------------------- 4. wrapper */
function dWrap() {
  var g = mk('wr'), ys = [20, 150, 280, 410, 540];
  g.box(0, 160, 230, 330, 'ext', ['Bus Avalon-MM', 'avs_address[13:0]', 'avs_read / avs_write', 'avs_writedata', 'avs_readdata', 'waitrequest = 0']);
  g.arrow([[230, 325], [290, 325]], 'd', true);
  g.box(290, 20, 130, 620, 'ctl', ['Giải mã', 'địa chỉ', '', 'avs_address', '[13:12]', 'chọn vùng']);
  var regs = [
    ['0x0000  Thanh ghi', 'CTRL · STATUS · M · CYCLES', 'INFO · QMULT · QSHIFT · ACT · BIAS', 'ctl'],
    ['0x4000  WEIGHT  (W)', 'word i·(N/4)+q = W[i][4q..4q+3]', '', 'mem'],
    ['0x8000  ABUF  (W)', 'hàng m của A, INT8', '', 'mem'],
    ['0xC000  CBUF  (R)', 'INT32 C[m][j] tại 4·(m·N+j)', '', 'mem'],
    ['0x1000  QBUF  (R)', 'INT8 sau requant + ACT', '', 'mem']
  ];
  regs.forEach(function (r, k) {
    var ln = [r[0], r[1]]; if (r[2]) ln.push(r[2]);
    g.box(480, ys[k], 400, 100, r[3], ln);
    g.arrow(k === 3 || k === 4 ? [[480, ys[k] + 50], [420, ys[k] + 50]] : [[420, ys[k] + 50], [480, ys[k] + 50]], k === 3 || k === 4 ? 'r' : 'd');
  });
  g.box(1010, 20, 310, 100, 'ctl', ['Sequencer', 'sent / recv · busy · done · err']);
  g.arrow([[880, 70], [1010, 70]], 'c');
  g.box(1010, 190, 310, 200, 'dp', ['sa_top', 'Systolic Array N×N', 'skew · de-skew', 'trễ 2N − 1 chu kỳ']);
  g.arrow([[880, 200], [1010, 230]], 'd');
  g.arrow([[880, 330], [1010, 330]], 'd');
  g.text(940, 322, 'a_in', 'cap', 17, 'middle');
  g.arrow([[1165, 120], [1165, 190]], 'c');
  g.box(1010, 450, 310, 190, 'dp', ['Cộng dồn + hậu xử lý', 'sum_row = CBUF cũ + c_out', '(sum + bias) × QMULT', '>>> QSHIFT · clamp · ACT']);
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

/* ---------------------------------------------------------------- 5. post-processing datapath */
function dPost() {
  var g = mk('po'), x0 = 0, bw = 200, gap = 40, y = 290, h = 130, xs = [], k;
  for (k = 0; k < 7; k++) xs.push(x0 + k * (bw + gap));
  g.box(xs[0], y, bw, h, 'dp', ['c_out[j]', 'INT32', 'từ sa_top'], 'c_out');
  g.box(xs[1], y, bw, h, 'dp', ['Cộng dồn', 'sum_row =', 'CBUF cũ + c_out'], 'acc');
  g.box(xs[2], y, bw, h, 'dp', ['Cộng bias', 'sum + bias[j]', 'INT32'], 'bias');
  g.box(xs[3], y, bw, h, 'dp', ['Nhân', '× QMULT', 'prod 48 bit'], 'mul');
  g.box(xs[4], y, bw, h, 'dp', ['Làm tròn + dịch', '+ 2^(QSHIFT−1)', '>>> QSHIFT'], 'shift');
  g.box(xs[5], y, bw, h, 'dp', ['Bão hòa', 'clamp8', '[−128, 127]'], 'clamp');
  g.box(xs[6], y, bw, h, 'dp', ['ACT', 'none · ReLU', 'sigmoid · tanh LUT'], 'act');
  for (k = 0; k < 6; k++) g.arrow([[xs[k] + bw, y + h / 2], [xs[k + 1], y + h / 2]], 'd');
  /* control inputs from above */
  g.box(xs[1] - 40, 60, 280, 90, 'ctl', ['CTRL.ACCUM', 'cộng CBUF cũ nếu = 1']);
  g.arrow([[xs[1] + 100, 150], [xs[1] + 100, y]], 'c');
  g.box(xs[2] + 20, 60, 160, 90, 'mem', ['bias[j]', 'INT32 · 0x40+4j']);
  g.arrow([[xs[2] + 100, 150], [xs[2] + 100, y]], 'c');
  g.box(xs[3] + 0, 60, 200, 90, 'ctl', ['QMULT', 'int16 có dấu']);
  g.arrow([[xs[3] + 100, 150], [xs[3] + 100, y]], 'c');
  g.box(xs[4] + 0, 60, 200, 90, 'ctl', ['QSHIFT', '0..31']);
  g.arrow([[xs[4] + 100, 150], [xs[4] + 100, y]], 'c');
  g.box(xs[6] + 0, 50, 200, 100, 'ctl', ['ACT', '0 none · 1 ReLU', '2 sigmoid · 3 tanh']);
  g.arrow([[xs[6] + 100, 150], [xs[6] + 100, y]], 'c');
  /* outputs below */
  g.box(xs[1], 560, bw, 90, 'mem', ['CBUF', 'INT32 (ghi mỗi hàng)']);
  g.arrow([[xs[1] + 100, y + h], [xs[1] + 100, 560]], 'd');
  g.box(xs[6], 560, bw, 90, 'mem', ['QBUF', 'INT8 · CPU đọc']);
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

/* ---------------------------------------------------------------- slide list */
var S = window.SLIDES;
var KIND = { 2: 'soc', 7: 'soc', 8: 'soc', 11: 'soc', 4: 'pe', 5: 'pe', 6: 'pe', 9: 'acc', 10: 'cyc' };
S.forEach(function (s, i) { s.kind = KIND[i] || 'trace'; });

function dia(key, title, lines, notes, svg) {
  return { title: title, short: title, lines: lines, notes: notes, plan: 60, kind: 'trace', dia: key, svg: svg };
}
var d1 = dia('sys', 'Sơ đồ khối: CPU điều khiển NPU qua Avalon-MM',
  ['Nguồn RTL: soc/soc_top.sv, rtl/npu_avmm.sv, rtl/sa_top.sv'],
  'Sơ đồ tổng thể. CPU RISC-V, là PicoRV32 trong mô phỏng và Nios V trên DE10-Nano, nối với RAM và với wrapper npu_avmm qua bus Avalon-MM 32 bit, cửa sổ 64 KiB, readLatency 1. Bên trong wrapper, CPU ghi weight vào sa_top, ghi activation vào ABUF, cấu hình qua thanh ghi. Kết quả đi qua khối cộng dồn và hậu xử lý, rồi được CPU đọc từ CBUF INT32 hoặc QBUF INT8.',
  dSys());
var d2 = dia('sa', 'Systolic Array: activation chạy ngang, tổng riêng chạy dọc',
  ['Nguồn RTL: rtl/pe.sv, rtl/sa_top.sv · mỗi PE: psum_out = psum_in + a_in × w'],
  'Mảng N nhân N phần tử xử lý. Weight được giữ cố định tại từng PE, activation INT8 dịch sang phải mỗi chu kỳ, tổng riêng INT32 đi xuống dưới và cộng thêm tích a nhân w ở mỗi hàng. Hàng trên cùng nhận psum bằng không. Dữ liệu vào được làm lệch nhịp bởi khối skew và kết quả được căn lại bởi khối de-skew, nên độ trễ từ in_valid đến out_valid là hai N trừ một chu kỳ.',
  dSa());
var d3 = dia('skew', 'Skew và de-skew: căn nhịp bằng các đường trễ',
  ['Nguồn RTL: rtl/delay.sv, rtl/sa_top.sv · hàng i trễ i, cột j trễ N−1−j, valid trễ 2N−1'],
  'Để các phần tử cùng một hàng của ma trận A gặp đúng weight tại đúng chu kỳ, hàng i được làm trễ i chu kỳ bằng chuỗi thanh ghi. Ở đầu ra, cột j bị trễ N trừ một trừ j chu kỳ để một hàng kết quả c_out được căn thẳng hàng. Tín hiệu valid đi qua đường trễ hai N trừ một chu kỳ, vì vậy out_valid đánh dấu đúng thời điểm một hàng kết quả đầy đủ xuất hiện. Với N bằng bốn là bảy chu kỳ.',
  dSkew());
var d4 = dia('wrap', 'Wrapper Avalon-MM: bản đồ thanh ghi, bộ đệm và sequencer',
  ['Nguồn RTL: rtl/npu_avmm.sv · địa chỉ word 14 bit, readLatency 1, không waitrequest'],
  'Wrapper npu_avmm là slave Avalon-MM. Hai bit cao của địa chỉ chọn vùng: thanh ghi điều khiển ở không, QBUF ở 0x1000, WEIGHT ở 0x4000, ABUF ở 0x8000 và CBUF ở 0xC000. Sequencer đọc từng hàng ABUF đưa vào sa_top, nhận kết quả, cộng dồn theo K-chunk vào CBUF và, khi bit QUANT bật, chạy tiếp bias, requant và hàm kích hoạt vào QBUF. Ghi WEIGHT và ABUF chỉ được chấp nhận khi NPU không bận.',
  dWrap());
var d5 = dia('post', 'Datapath hậu xử lý: từ INT32 về INT8',
  ['Nguồn RTL: rtl/npu_avmm.sv · y = clamp8(((acc + bias) × QMULT + 2^(QSHIFT−1)) >>> QSHIFT), rồi ACT'],
  'Khối hậu xử lý chạy cho mỗi cột kết quả. Đầu tiên cộng dồn theo K-chunk với giá trị CBUF cũ nếu bit ACCUM bật, sau đó cộng bias, nhân với QMULT là số nguyên 16 bit có dấu, cộng hằng làm tròn rồi dịch phải QSHIFT, bão hòa về khoảng âm 128 đến 127. Cuối cùng là hàm kích hoạt: không có, ReLU, hoặc tra bảng sigmoid hoặc tanh. Kết quả INT8 ghi vào QBUF, còn tổng INT32 luôn được ghi vào CBUF.',
  dPost());

/* splice: system after SoC (idx 2), array + skew + wrapper + post after systolic scene (idx 5) */
var out = [];
S.forEach(function (s, i) {
  out.push(s);
  if (i === 2) out.push(d1);
  if (i === 5) out.push(d2, d3, d4, d5);
});
window.SLIDES = out;
})();
