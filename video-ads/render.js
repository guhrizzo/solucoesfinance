const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const { total } = JSON.parse(fs.readFileSync('timing.json'));
  const b = await chromium.launch({executablePath: process.env.CHROME_EXE});
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + process.cwd().replace(/\\/g, '/') + '/index.html');
  await p.evaluate(() => document.fonts.ready);
  fs.mkdirSync('frames', { recursive: true });
  const n = Math.ceil(total * 30);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), (i / 30) * 1000);
    await p.screenshot({ path: `frames/f${String(i).padStart(4, '0')}.png` });
  }
  await b.close();
  console.log('frames', n);
})();
