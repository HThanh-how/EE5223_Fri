// Flatten the Subcircuit instances of a yosys2digitaljs JSON (one level or nested) and give the
// internal cells readable labels ("PE01 multiplier" ...). Usage: node flatten.mjs in.json out.json
import fs from 'fs';
const [inp, outp] = process.argv.slice(2);
const top = JSON.parse(fs.readFileSync(inp, 'utf8'));
const subs = top.subcircuits || {};
const nice = { Multiplication: 'multiplier', Addition: 'adder', Dff: 'register' };

function flatten(mod, prefix) {
  // returns {devices, connectors} with all Subcircuits expanded
  let devices = {}, conns = [];
  const subDevs = {};   // id -> {inst, io: {portNet: {inputs:[{id,...}]}}}
  for (const [id, d] of Object.entries(mod.devices)) {
    if (d.type !== 'Subcircuit') { devices[id] = { ...d }; continue; }
    const sub = flatten(subs[d.celltype], '');
    const inst = d.label || id;
    const map = {};
    for (const [sid, sd] of Object.entries(sub.devices)) {
      const nid = `${id}__${sid}`;
      map[sid] = nid;
      devices[nid] = { ...sd, _inst: inst + (sd._inst ? '.' + sd._inst : '') };
    }
    const inPorts = {}, outPorts = {};
    for (const [sid, sd] of Object.entries(sub.devices)) {
      if (sd.type === 'Input') inPorts[sd.net] = sid;
      if (sd.type === 'Output') outPorts[sd.net] = sid;
    }
    subDevs[id] = { map, inPorts, outPorts, sub };
    for (const c of sub.connectors) {
      conns.push({ ...c, _inner: true, from: { ...c.from, id: map[c.from.id] }, to: { ...c.to, id: map[c.to.id] }, _inst: inst });
    }
  }
  // rewrite outer connectors touching subcircuit ports
  for (const c of mod.connectors) {
    conns.push({ ...c, from: { ...c.from }, to: { ...c.to } });
  }
  // resolve: connectors into a sub input port -> fan out to inner targets; from sub output -> inner source
  let changed = true;
  while (changed) {
    changed = false;
    const out = [];
    for (const c of conns) {
      const tSub = subDevs[c.to.id], fSub = subDevs[c.from.id];
      if (fSub) {
        const outId = fSub.map[fSub.outPorts[c.from.port]];
        for (const ic of conns.filter(x => x.to.id === outId)) out.push({ ...c, from: ic.from, name: c.name });
        changed = true;
      } else if (tSub) {
        const inId = tSub.map[tSub.inPorts[c.to.port]];
        for (const ic of conns.filter(x => x.from.id === inId)) out.push({ ...ic, from: c.from, name: c.name });
        changed = true;
      } else out.push(c);
    }
    conns = out;
  }
  const ioIds = new Set();
  for (const s of Object.values(subDevs)) {
    for (const p of Object.values(s.inPorts)) ioIds.add(s.map[p]);
    for (const p of Object.values(s.outPorts)) ioIds.add(s.map[p]);
  }
  conns = conns.filter(c => !ioIds.has(c.from.id) && !ioIds.has(c.to.id));
  for (const id of ioIds) delete devices[id];
  // dedupe
  const seen = new Set();
  conns = conns.filter(c => { const k = JSON.stringify([c.from, c.to]); if (seen.has(k)) return false; seen.add(k); return true; });
  return { devices, connectors: conns };
}
const flat = flatten(top, '');
// labels + grid layout
const N = Math.round(Math.sqrt(Object.values(flat.devices).filter(d => d.type === 'Multiplication').length));
const TW = 400, TH = 290, X0 = 480, Y0 = 130;
const nets = {};                       // device id -> outgoing connector name
for (const c of flat.connectors) nets[c.from.id] = nets[c.from.id] || c.name;
const place = (d, x, y) => { d.position = { x: Math.round(x), y: Math.round(y) }; };
for (const [id, d] of Object.entries(flat.devices)) {
  const inst = d._inst || '';
  let m;
  if ((m = /^u_pe(\d)(\d)$/.exec(inst))) {
    const i = +m[1], j = +m[2], ox = X0 + j * TW, oy = Y0 + i * TH;
    let nm = nice[d.type];
    if (d.type === 'Dff') nm = d.bits === 8 ? 'activation reg' : 'partial-sum reg';
    d.label = `PE(${i},${j}) ${nm}`; d.hide_label = false;
    if (d.type === 'Multiplication') place(d, ox + 100, oy + 105);
    else if (d.type === 'Addition') place(d, ox + 215, oy + 30);
    else if (d.bits === 8) place(d, ox + 20, oy + 232);
    else place(d, ox + 215, oy + 150);
  } else if ((m = /^usk(\d+)_(\d+)$/.exec(inst))) {
    const i = +m[1], k = +m[2];
    d.label = `skew reg (row ${i})`; d.hide_label = false;
    place(d, 120 + 150 * k, Y0 + i * TH + 242);
  } else if ((m = /^uds(\d+)_(\d+)$/.exec(inst))) {
    const j = +m[1], k = +m[2];
    d.label = `de-skew reg (col ${j})`; d.hide_label = false;
    place(d, X0 + j * TW + 215, Y0 + N * TH + 30 + 105 * k);
  } else if ((m = /^uv(\d+)$/.exec(inst))) {
    d.label = `valid delay ${+m[1] + 1}`; d.hide_label = false;
    place(d, X0 + 150 * +m[1], 30);
  } else if (d.type === 'Input') {
    if ((m = /^a(\d+)$/.exec(d.net))) place(d, 20, Y0 + +m[1] * TH + 247);
    else if ((m = /^w(\d)(\d)$/.exec(d.net))) place(d, X0 + +m[2] * TW + 20, Y0 + +m[1] * TH + 95);
    else if (d.net === 'clk') place(d, 20, 30);
    else if (d.net === 'rst_n') place(d, 20, 90);
    else if (d.net === 'in_valid') place(d, 300, 40);
  } else if (d.type === 'Output') {
    if ((m = /^c(\d+)$/.exec(d.net))) place(d, X0 + +m[1] * TW + 330, Y0 + N * TH + 30 + 105 * (N - 1 - +m[1]) + 20);
    else if (d.net === 'out_valid') place(d, X0 + 150 * (2 * N - 1) + 20, 40);
  } else if (d.type === 'Constant') {
    const mm = /^ps0_(\d+)$/.exec(nets[id] || '');
    if (mm) place(d, X0 + +mm[1] * TW + 140, Y0 + 5);
  }
  delete d._inst;
}
for (const c of flat.connectors) { delete c._inner; delete c._inst; }
const out = { subcircuits: {}, devices: flat.devices, connectors: flat.connectors };
fs.writeFileSync(outp, JSON.stringify(out));
console.log(outp, Object.keys(out.devices).length, 'devices', out.connectors.length, 'wires', 'unplaced:', Object.entries(out.devices).filter(([k, d]) => !d.position).map(([k, d]) => d.type + ':' + (d.net || d.label)).join(','));
