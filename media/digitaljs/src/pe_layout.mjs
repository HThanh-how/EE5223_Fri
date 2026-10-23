// Readable labels and hand placement for the single PE circuit (output of yosys2digitaljs for pe.v).
import fs from 'fs';
const [inp, outp] = process.argv.slice(2);
const c = JSON.parse(fs.readFileSync(inp, 'utf8'));
const P = { Input: {}, Output: {} };
const at = (d, x, y) => { d.position = { x, y }; };
for (const [id, d] of Object.entries(c.devices)) {
  if (d.type === 'Input') at(d, 20, { psum_in: 20, w: 110, a_in: 200, clk: 330, rst_n: 400 }[d.net]);
  else if (d.type === 'Output') at(d, 900, d.net === 'psum_out' ? 40 : 270);
  else if (d.type === 'Multiplication') { d.label = 'multiplier (a x w)'; d.hide_label = false; at(d, 280, 150); }
  else if (d.type === 'Addition') { d.label = 'adder (+ partial sum)'; d.hide_label = false; at(d, 480, 50); }
  else if (d.type === 'Dff' && d.bits === 32) { d.label = 'partial-sum register'; d.hide_label = false; at(d, 680, 30); }
  else if (d.type === 'Dff') { d.label = 'activation register'; d.hide_label = false; at(d, 680, 260); }
}
for (const k of c.connectors) if (k.from.id === 'dev7' && k.to.id === 'dev9') k.name = 'next sum';
fs.writeFileSync(outp, JSON.stringify(c));
console.log(outp, Object.keys(c.devices).length);
