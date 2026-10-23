import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const y2d = require('/root/work_dj/node_modules/yosys2digitaljs/dist/index.js');
const [top, ...files] = process.argv.slice(2);
const src = {};
for (const f of files) src[f] = fs.readFileSync(f, 'utf8');
const out = await y2d.process_files(src, { optimize: true, fsm: false, fsmexpand: false });
if (!out.output) { console.error(out.yosys_stderr, out.yosys_stdout); process.exit(1); }
const circ = out.output;
fs.writeFileSync(`${top}.json`, JSON.stringify(circ));
console.log(top, 'devices', Object.keys(circ.devices).length, 'subcircuits', Object.keys(circ.subcircuits||{}));
