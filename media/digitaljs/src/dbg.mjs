import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('http://localhost:8123/?c=sa2'); await p.evaluate(() => window.simReady); await p.waitForTimeout(1000);
console.log(JSON.stringify(await p.evaluate(() => { const w = document.getElementById('paperWrap'); return { s: paper.scale(), bbox: circuit._graph.getBBox(), cw: w.clientWidth, ch: w.clientHeight, sh: w.scrollHeight, sw: w.scrollWidth, ca: paper.getContentArea(), cb: paper.getContentBBox(), tr: paper.translate(), dim: paper.getComputedSize() }; })));
await b.close();
