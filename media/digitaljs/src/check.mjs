import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
for (const c of ['pe', 'sa2', 'sa4']) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(`http://localhost:8123/?c=${c}`);
  await p.evaluate(() => window.simReady);
  await p.waitForTimeout(500);
  let n = 0;
  while (n++ < 60 && (await p.evaluate(() => window.sim.stepHalf()))) {}
  console.log(c, 'halfsteps', n, JSON.stringify(await p.evaluate(() => ({ r: window.sim.results(), ref: window.sim.ref(), done: window.sim.state().done, cyc: window.sim.state().cycle, psum: window.sim.val('psum_out') }))));
  if (c !== 'pe') await p.screenshot({ path: `shots/final_${c}.png` });
  await p.close();
}
await b.close();
