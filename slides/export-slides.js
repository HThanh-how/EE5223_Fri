// node export-slides.js  ->  export/slides.json + export/NN.svg (one standalone SVG per slide, dark theme styling inlined)
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const win = { SLIDES: null }; win.window = win;
const ctx = vm.createContext({ window: win, document: { addEventListener() {} }, console, Math, Array, Object, String, JSON });
vm.runInContext(src('content.js'), ctx);
vm.runInContext(src('deck.js'), ctx);
const S = win.SLIDES, out = path.join(__dirname, 'export');
fs.mkdirSync(out, { recursive: true });
const css = fs.readFileSync(path.join(__dirname, 'src', 'variant.css'), 'utf8').split('/* interactive diagrams v2')[1] || '';
const meta = S.map((s, i) => {
  const n = String(i + 1).padStart(2, '0');
  if (s.svg) fs.writeFileSync(path.join(out, n + '.svg'), s.svg.replace('<svg ', '<svg data-slide="' + n + '" '));
  return { n: i + 1, title: s.title, lines: s.lines, notes: s.notes, svg: s.svg ? n + '.svg' : null };
});
fs.writeFileSync(path.join(out, 'slides.json'), JSON.stringify(meta, null, 1));
console.log('exported', meta.length, 'slides');
