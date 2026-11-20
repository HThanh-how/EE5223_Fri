const fs=require('fs'),path=require('path');
const root=__dirname, src=path.join(root,'src');
const m=JSON.parse(fs.readFileSync(path.join(src,'manifest.json'),'utf8'));
const read=p=>fs.readFileSync(path.join(src,p),'utf8');
const safe=s=>s.replace(/<\/script/gi,'<\\/script');
const html=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${m.title}</title><style>${m.css.map(read).join('\n')}</style></head><body>${read(m.body)}<script>${safe(fs.readFileSync(path.join(root,'vendor','three-bundle.js'),'utf8'))}</script>${m.js.map(f=>`<script>${safe(read(f))}</script>`).join('\n')}</body></html>`;
fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist','EE5223-NPU-slides.html'),html);console.log('Built EE5223-NPU-slides.html');
