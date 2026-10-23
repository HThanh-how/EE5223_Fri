import './jq.js';
import { Circuit } from 'digitaljs';
import { Vector3vl } from '3vl';

const CIRCUITS = [
  { id: 'pe',  title: 'One MAC cell (pe.sv)',          file: 'circuits/pe_nice.json',       kind: 'pe' },
  { id: 'sa2', title: '2x2 systolic array (4 PEs)',    file: 'circuits/sa2_flat.json', kind: 'sa', N: 2 },
  { id: 'sa4', title: '4x4 systolic array (16 PEs)',   file: 'circuits/sa4_flat.json', kind: 'sa', N: 4 },
];
const DEMO_W4 = [[1, 0, 2, -1], [3, 1, 0, 2], [-2, 4, 1, 0], [0, 1, -1, 3]];   // same as viz/README demo
const DEMO_A4 = [[1, 2, 3, 4], [5, 6, 7, 8], [-1, 0, 1, 2], [2, -3, 4, -5]];
const DEMO = {
  pe:  { w: -3, rows: [[5, 0], [2, -15], [4, -21]] },     // (a_in, psum_in) per cycle; psum_in = what the PE above would pass down
  sa2: { W: [[1, 0], [3, 1]], A: [[1, 2], [5, 6], [-1, 0]] },        // top-left 2x2 of the viz demo; A has a negative entry
  sa4: { W: DEMO_W4, A: DEMO_A4 },
};
const WAVES = {
  pe:  ['clk', 'a_in', 'w', 'psum_in', 'a_out', 'psum_out'],
  sa2: ['clk', 'in_valid', 'a0', 'a1', 'ps1_0', 'ps1_1', 'c0', 'c1', 'out_valid'],
  sa4: ['clk', 'in_valid', 'a0', 'a1', 'a2', 'a3', 'c0', 'c1', 'c2', 'c3', 'out_valid'],
};
const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
const toBin = (n, bits) => (BigInt.asUintN(bits, BigInt(n))).toString(2).padStart(bits, '0');
const sigOf = (n, bits) => Vector3vl.fromBin(toBin(n, bits));
const sval = (sig) => {                       // signed integer or null (X); 1-bit signals are unsigned (0/1)
  if (!sig) return null;
  const b = sig.toBin();
  if (/[^01]/.test(b)) return null;
  if (b.length === 1) return Number(b);
  return Number(BigInt.asIntN(b.length, BigInt('0b' + b)));
};
const matmul = (A, W) => A.map((r) => W[0].map((_, j) => r.reduce((s, x, k) => s + x * W[k][j], 0)));
const clamp8 = (v) => Math.max(-128, Math.min(127, Math.round(Number(v) || 0)));

let circuit = null, paper = null, cfg = null;
let S = null;               // sim state
let timer = null;

function sigByName(name) {
  const idx = circuit.makeLabelIndex();
  if (idx.inputs[name]) return idx.inputs[name].get('outputSignals').out;
  if (idx.outputs[name]) return idx.outputs[name].get('inputSignals').in;
  const w = idx.wires[name];
  return w ? w.get('signal') : null;
}
function val(name) { return sval(sigByName(name)); }
function setIn(name, n) {
  const cell = circuit.makeLabelIndex().inputs[name];
  cell.setInput(sigOf(n, cell.get('bits')));
}
function settle() {
  let n = 0;
  while (circuit.hasPendingEvents && n++ < 20000) circuit.updateGates();
}

// ---------- load ----------
async function load(id) {
  stop();
  cfg = CIRCUITS.find((c) => c.id === id) || CIRCUITS[0];
  $('sel').value = cfg.id;
  if (circuit) { circuit.shutdown(); paper && paper.remove(); }
  $('paperWrap').innerHTML = '<div id="paper"></div>';
  const json = await (await fetch(cfg.file)).json();
  circuit = new Circuit(json, { layoutEngine: 'elkjs' });
  { const d = circuit._display3vl, orig = d.show.bind(d);   // show signed decimal on I/O cells
    d.show = (b, sg) => (b === 'dec' && sg.bits > 1 && !/[^01]/.test(sg.toBin())) ? String(sval(sg)) : orig(b, sg); }
  for (const c of [...circuit.getInputCells(), ...circuit.getOutputCells()]) if (c.get('bits') > 1) c.set('numbase', 'dec');
  paper = circuit.displayOn($('paper'));
  window.circuit = circuit; window.paper = paper;
  await new Promise((res) => paper.once('render:done', res));
  await new Promise((res) => setTimeout(res, 900));
  fit();
  await new Promise((res) => setTimeout(res, 300));
  fit();
  decorateWires();
  buildStim();
  $('legendTxt').textContent = cfg.kind === 'pe'
    ? 'Blocks: multiplier (a x w), adder (+ partial sum), two clocked registers. Wire colours: green = 1, red = 0, blue = multi-bit value; each label shows the live signed decimal value.'
    : 'Activations flow to the right, partial sums flow down. "a into PEij" / "sum into PEij" = value entering cell (i,j); each cell = multiplier + adder + 2 registers. Wire colours: green = 1, red = 0, blue = multi-bit value (label = live signed decimal).';
  resetSim();
  return cfg;
}
function fit() {
  const wrap = $('paperWrap');
  const area = circuit._graph.getBBox();
  const s = Math.min((wrap.clientWidth - 90) / area.width, (wrap.clientHeight - 100) / area.height, 1.5);
  paper.scale(s);
  paper.fitToContent({ padding: 20, allowNewOrigin: 'any', minWidth: wrap.clientWidth, minHeight: wrap.clientHeight });
}
function prettyNet(n) {
  let m;
  if ((m = /^ab(\d+)_(\d+)$/.exec(n))) return `a into PE${m[1]}${m[2]}`;
  if ((m = /^ps(\d+)_(\d+)$/.exec(n))) return (+m[1] === cfg.N) ? `sum out col ${m[2]}` : `sum into PE${m[1]}${m[2]}`;
  return n;
}
function decorateWires() {
  const g = circuit._graph;
  const upd = (w) => {
    const net = w.get('netname');
    if (!net) return;
    if (net === 'clk' || net === 'rst_n') { w.label(0, { attrs: { label: { text: '' } } }); const tgt = w.getTargetElement && w.getTargetElement(); const keep = tgt && /valid delay/.test(tgt.get('label') || ''); w.attr('line/opacity', keep ? 0.5 : 0); return; }
    const v = sval(w.get('signal'));
    const bits = w.get('bits');
    const t = bits === 1 ? `${prettyNet(net)} = ${w.get('signal').toBin()}` : `${prettyNet(net)} = ${v === null ? 'x' : v}`;
    w.label(0, { attrs: { label: { text: t, fontSize: '9pt', fontWeight: 'bold', fill: '#0f172a', stroke: '#fff', strokeWidth: 3, paintOrder: 'stroke' } }, position: { distance: /^ab/.test(net) ? 0.3 : /^ps/.test(net) ? 0.7 : 0.5 } });
  };
  g.getLinks().forEach(upd);
  g.on('change:signal', upd);
}

// ---------- stimulus UI ----------
function numCell(id, v) { return `<td><input type="number" id="${id}" min="-128" max="127" value="${v}"></td>`; }
function buildStim() {
  const d = DEMO[cfg.id];
  let h = '';
  if (cfg.kind === 'pe') {
    let t = '<tr><td>cycle</td><td>a_in</td><td>psum_in</td></tr>';
    d.rows.forEach((r, k) => { t += `<tr><td>${k}</td>${numCell(`i_a${k}`, r[0])}<td><input type="number" id="i_p${k}" value="${r[1]}" style="width:72px"></td></tr>`; });
    h = `<div class="mats"><div>w (weight, stored in the cell)<table><tr><td>w</td>${numCell('i_w', d.w)}</tr></table></div><div>Values applied each cycle (zeros afterwards)<table>${t}</table></div></div>`;
  } else {
    const N = cfg.N;
    h = '<div class="mats"><div>W (weights, row i feeds PE row i)<table>';
    for (let i = 0; i < N; i++) { h += '<tr>'; for (let j = 0; j < N; j++) h += numCell(`W_${i}_${j}`, d.W[i][j]); h += '</tr>'; }
    h += `</table></div><div>A (one row per cycle), rows: <input type="number" id="Mrows" min="1" max="6" value="${d.A.length}" style="width:46px"><table id="Atab"></table></div></div>`;
  }
  $('stimBody').innerHTML = h;
  if (cfg.kind === 'sa') {
    const draw = () => {
      const M = Math.max(1, Math.min(6, +$('Mrows').value || 1));
      const cur = readA();
      let t = '';
      for (let m = 0; m < M; m++) {
        t += '<tr>';
        for (let k = 0; k < cfg.N; k++) t += numCell(`A_${m}_${k}`, (cur[m] && cur[m][k] !== undefined) ? cur[m][k] : (d.A[m] ? d.A[m][k] : 0));
        t += '</tr>';
      }
      $('Atab').innerHTML = t;
    };
    $('Mrows').onchange = draw;
    let t = '';
    for (let m = 0; m < d.A.length; m++) { t += '<tr>'; for (let k = 0; k < cfg.N; k++) t += numCell(`A_${m}_${k}`, d.A[m][k]); t += '</tr>'; }
    $('Atab').innerHTML = t;
  }
}
function readA() {
  const A = [];
  for (let m = 0; m < 6; m++) {
    if (!$(`A_${m}_0`)) break;
    A.push(Array.from({ length: cfg.N }, (_, k) => clamp8($(`A_${m}_${k}`).value)));
  }
  return A;
}
function readStim() {
  if (cfg.kind === 'pe') return { w: clamp8($('i_w').value), rows: DEMO.pe.rows.map((_, k) => [clamp8($(`i_a${k}`).value), Math.max(-1e6, Math.min(1e6, Math.round(+$(`i_p${k}`).value || 0)))]) };
  const W = Array.from({ length: cfg.N }, (_, i) => Array.from({ length: cfg.N }, (_, j) => clamp8($(`W_${i}_${j}`).value)));
  return { W, A: readA() };
}

// ---------- simulation ----------
function sample(label) {
  const row = { clk: val('clk'), label, v: {} };
  for (const n of WAVES[cfg.id]) { const s = sigByName(n); row.v[n] = { v: sval(s), bits: s ? s.bits : 1 }; }
  S.hist.push(row);
  drawWave();
}
function resetSim() {
  stop();
  const st = readStim();
  S = { st, cycle: 0, next: 'apply', hist: [], results: [], done: false, refC: cfg.kind === 'sa' ? matmul(st.A, st.W) : null };
  for (const c of circuit.getInputCells()) c.setInput(sigOf(0, c.get('bits')));   // rst_n = 0, all zero
  settle();
  setIn('rst_n', 1);
  settle();
  if (cfg.kind === 'sa') for (let i = 0; i < cfg.N; i++) for (let j = 0; j < cfg.N; j++) setIn(`w${i}${j}`, st.W[i][j]);
  settle();
  sample('reset');
  caption('Reset done', cfg.kind === 'pe'
    ? 'All registers hold 0 and the clock is low. Press <b>Step</b>: first the inputs are applied (watch the multiplier and adder react), then the clock edge makes the registers capture the result.'
    : `Power-up: every register in the array is 0 and the clock is low. The ${cfg.N}x${cfg.N} grid of cells already holds its weights (stationary). Press <b>Step</b> (or <b>Run</b>) to stream the rows of A in, one per clock cycle.`);
  render();
}
function applyStep() {
  const k = S.cycle, st = S.st;
  setIn('clk', 0);
  if (cfg.kind === 'pe') { const r = st.rows[k] || [0, 0]; setIn('w', st.w); setIn('a_in', r[0]); setIn('psum_in', r[1]); }
  else {
    const row = st.A[k];
    for (let i = 0; i < cfg.N; i++) setIn(`a${i}`, row ? row[i] : 0);
    setIn('in_valid', row ? 1 : 0);
  }
  settle();
  sample(`apply ${k}`);
  S.next = 'edge';
  if (cfg.kind === 'pe') {
    const a = val('a_in'), w = val('w'), p = val('psum_in');
    caption(`Cycle ${k}: inputs applied`, `Inputs are applied with the clock still low${st.rows[k] ? '' : ' (no more data: zeros)'}. The <b>multiplier</b> forms ${a} x ${w} = <b>${a * w}</b>. The <b>adder</b> adds the partial sum arriving from above (${p}): ${p} + ${a * w} = <b>${p + a * w}</b>. That total is only waiting at the register inputs - nothing is stored until the clock edge.`);
  } else {
    const row = st.A[k];
    let body = row
      ? `Row ${k} of A = <b>[${row.join(', ')}]</b> is presented on the left edge (in_valid = 1). Row i is held back by i skew registers, so the numbers reach the grid as a diagonal wave. `
      : 'No more rows of A: zeros are fed in (in_valid = 0) while the last results drain out. ';
    body += 'What each active cell computes right now (before the clock edge):';
    caption(`Cycle ${k}: inputs applied`, body + peLines());
  }
  render();
}
function aIntoPE(i, j) {
  const idx = circuit.makeLabelIndex();
  const nm = `ab${i}_${j}`;
  if (idx.wires[nm]) return val(nm);
  if (j === 0 && i === 0) return val('a0');
  return null;
}
function peLines() {
  const lines = [];
  for (let i = 0; i < cfg.N; i++) for (let j = 0; j < cfg.N; j++) {
    const a = aIntoPE(i, j), s = val(`ps${i}_${j}`);
    const w = S.st.W[i][j];
    if (a === null || s === null) continue;
    if (a === 0 && s === 0) continue;
    lines.push(`<span class="pe"><b>PE(${i},${j})</b>: ${a} x ${w} + ${s} = <b>${a * w + s}</b></span>`);
  }
  const max = cfg.N === 2 ? 4 : 4;
  const shown = lines.slice(0, max);
  if (lines.length > max) shown.push(`<span class="pe">... and ${lines.length - max} more cells working in parallel</span>`);
  return shown.join('') || '<span class="pe">No cell has a non-zero input yet.</span>';
}
function edgeStep() {
  const k = S.cycle;
  setIn('clk', 1);
  settle();
  S.cycle++;
  sample(`edge ${k}`);
  S.next = 'apply';
  let body;
  if (cfg.kind === 'pe') {
    if (S.cycle >= S.st.rows.length) S.done = true;
    body = `<b>Rising clock edge.</b> Both registers copy their inputs at the same instant: a_out = <b>${val('a_out')}</b> (the activation, passed on to the PE on the right) and psum_out = <b>${val('psum_out')}</b> (the new running sum, passed to the PE below).`;
  } else {
    body = '<b>Rising clock edge.</b> Every register in the array loads at the same instant: activations move one cell to the right, partial sums move one cell down. ';
    if (val('out_valid') === 1) {
      const row = Array.from({ length: cfg.N }, (_, j) => val(`c${j}`));
      S.results.push(row);
      const m = S.results.length - 1;
      body += `<br><b>out_valid = 1</b>: a finished row leaves the bottom: C[${m}] = <b>[${row.join(', ')}]</b>` + (S.refC[m] ? ` (reference ${JSON.stringify(S.refC[m])}).` : '.');
    }
    const M = S.st.A.length;
    if (S.results.length >= M) {
      S.done = true;
      const ok = S.results.every((r, m) => r.every((x, j) => x === S.refC[m][j]));
      body += `<br><br>All ${M} rows are out. ${ok ? 'The hardware result <b>equals the plain matrix product C = A x W</b>.' : 'MISMATCH versus reference!'}`;
    }
  }
  caption(`Cycle ${k}: clock edge`, body);
  render();
}
function stepHalf() {
  if (S.done && S.next === 'apply') return false;
  if (S.next === 'apply') applyStep(); else edgeStep();
  return true;
}
function stepCycle() { if (S.next === 'apply') stepHalf(); stepHalf(); }
function play() {
  if (timer) return stop();
  $('btnPlay').textContent = 'Pause';
  const tick = () => {
    if (!stepHalf()) { stop(); return; }
    timer = setTimeout(tick, 1800 / +$('speed').value);
  };
  timer = setTimeout(tick, 0);
}
function stop() {
  if (timer) { clearTimeout(timer); timer = null; }
  const b = $('btnPlay'); if (b) b.textContent = 'Run';
}

// ---------- UI rendering ----------
function caption(t, b) { $('capTitle').textContent = t; $('capBody').innerHTML = b; }
function render() {
  const clk = val('clk');
  $('clkLamp').classList.toggle('hi', clk === 1);
  $('clkText').textContent = clk === 1 ? 'Clock = 1 (rising edge)' : 'Clock = 0';
  $('cycleText').textContent = `cycle ${S.cycle}`;
  let h = '';
  if (cfg.kind === 'pe') {
    h = `<div><div class="lbl">psum_out register now holds</div><b>${val('psum_out')}</b></div>`;
  } else {
    const M = S.st.A.length;
    const tbl = (rows, cls) => '<table>' + rows.map((r, m) => '<tr>' + r.map((x, j) => `<td class="${cls(m, j, x)}">${x === undefined ? '' : x}</td>`).join('') + '</tr>').join('') + '</table>';
    const got = S.refC.map((r, m) => r.map((_, j) => (S.results[m] ? S.results[m][j] : undefined)));
    h += `<div><div class="lbl">C from the circuit (c_out rows as they emerge)</div>${tbl(got, (m, j, x) => x === undefined ? 'empty' : (x === S.refC[m][j] ? 'ok' : ''))}</div>`;
    h += `<div><div class="lbl">Reference C = A x W (plain JavaScript)</div>${tbl(S.refC, () => '')}</div>`;
    const ok = S.done && S.results.every((r, m) => r.every((x, j) => x === S.refC[m][j]));
    h += `<div class="badge ${S.done ? (ok ? 'ok' : 'bad') : 'wait'}">${S.done ? (ok ? 'matches reference' : 'MISMATCH') : `${S.results.length}/${M} rows out`}</div>`;
  }
  $('resBody').innerHTML = h;
}

// ---------- waveform ----------
function drawWave() {
  const cv = $('wave'); const g = cv.getContext('2d');
  const names = WAVES[cfg.id];
  const W = cv.width, H = cv.height, L = 120, top = 6;
  g.clearRect(0, 0, W, H); g.fillStyle = '#0b1325'; g.fillRect(0, 0, W, H);
  const rowH = (H - top - 16) / names.length;
  const maxCols = Math.max(24, S.hist.length);
  const cw = (W - L - 10) / maxCols;
  g.font = '13px system-ui,Arial'; g.textBaseline = 'middle';
  S.hist.forEach((h, c) => {
    if (h.label.startsWith('edge')) { g.fillStyle = '#16294a'; g.fillRect(L + c * cw, top, cw, H - top - 16); }
  });
  names.forEach((n, r) => {
    const y0 = top + r * rowH, mid = y0 + rowH / 2;
    g.fillStyle = '#9fb2d1'; g.textAlign = 'left'; g.fillText(n, 8, mid);
    g.strokeStyle = '#1b2a48'; g.beginPath(); g.moveTo(L, y0 + rowH); g.lineTo(W - 4, y0 + rowH); g.stroke();
    const bits = S.hist[0] ? S.hist[0].v[n].bits : 1;
    if (bits === 1) {
      g.strokeStyle = n === 'clk' ? '#facc15' : '#34d399'; g.lineWidth = 2; g.beginPath();
      let py = null;
      S.hist.forEach((h, c) => {
        const v = h.v[n].v; const y = v ? y0 + 5 : y0 + rowH - 5;
        const x0 = L + c * cw, x1 = x0 + cw;
        if (py === null) g.moveTo(x0, y); else if (py !== y) g.lineTo(x0, y);
        g.lineTo(x1, y); py = y;
      });
      g.stroke(); g.lineWidth = 1;
    } else {
      let c = 0;
      while (c < S.hist.length) {
        let e = c; const v = S.hist[c].v[n].v;
        while (e + 1 < S.hist.length && S.hist[e + 1].v[n].v === v) e++;
        const x0 = L + c * cw + 1, x1 = L + (e + 1) * cw - 1;
        g.fillStyle = (v === 0) ? '#1e293b' : '#1d4ed8'; g.strokeStyle = '#60a5fa';
        g.beginPath(); g.rect(x0, y0 + 3, x1 - x0, rowH - 6); g.fill(); g.stroke();
        g.fillStyle = '#e2e8f0'; g.textAlign = 'center';
        if (x1 - x0 > 18) g.fillText(v === null ? 'x' : String(v), (x0 + x1) / 2, mid);
        c = e + 1;
      }
    }
  });
  if (S.hist.length) { const x = L + S.hist.length * cw; g.strokeStyle = '#f472b6'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, top); g.lineTo(x, H - 16); g.stroke(); g.lineWidth = 1; }
  g.fillStyle = '#64748b'; g.textAlign = 'center'; g.font = '11px system-ui';
  S.hist.forEach((h, c) => { if (h.label.startsWith('edge')) g.fillText('edge ' + h.label.split(' ')[1], L + c * cw + cw / 2, H - 6); });
}

// ---------- init ----------
$('sel').innerHTML = CIRCUITS.map((c) => `<option value="${c.id}">${c.title}</option>`).join('');
$('sel').onchange = () => load($('sel').value);
$('btnReset').onclick = () => resetSim();
$('btnApply').onclick = () => resetSim();
$('btnHalf').onclick = () => { stop(); stepHalf(); };
$('btnCycle').onclick = () => { stop(); stepCycle(); };
$('btnPlay').onclick = play;
let zoomK = 1;
const zoomBy = (f) => { paper.scale(paper.scale().sx * f); paper.fitToContent({ padding: 20, allowNewOrigin: 'any' }); };
$('zp').onclick = () => zoomBy(1.25); $('zm').onclick = () => zoomBy(0.8); $('zf').onclick = () => fit();
$('speed').oninput = () => { $('speedv').textContent = $('speed').value + 'x'; };
$('speedv').textContent = $('speed').value + 'x';
window.sim = {
  load, reset: resetSim, zoomBy: (f) => zoomBy(f), scrollTo: (x, y) => { const w = $('paperWrap'); w.scrollLeft = x; w.scrollTop = y; }, stepHalf: () => stepHalf(), stepCycle, state: () => S, val, fit,
  results: () => S.results, ref: () => S.refC, listWires: () => circuit._graph.getLinks().map((l) => l.get('netname')),
};
const q = new URLSearchParams(location.search).get('c') || 'sa2';
window.simReady = load(q);
