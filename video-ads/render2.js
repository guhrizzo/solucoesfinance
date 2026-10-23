const { chromium } = require('playwright');
const fs = require('fs');
// usage: node render2.js <html> <outdir> <fromFrame> <toFrameExclusive> [transparent]
(async () => {
  const [html, out, f0, f1] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + process.cwd().replace(/\\/g, '/') + '/' + html);
  await p.evaluate(() => document.fonts.ready);
  fs.mkdirSync(out, { recursive: true });
  for (let i = +f0; i < +f1; i++) {
    await p.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), (i / 30) * 1000);
    await p.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.png` });
  }
  await b.close();
  console.log(out, f0, f1);
})();
