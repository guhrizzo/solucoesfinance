const { chromium } = require('playwright');
const fs = require('fs');
// node render3.js  -> renderiza todas as cenas em frames locais (t = i/30)
const tl = JSON.parse(fs.readFileSync('timeline.json'));
const jobs = [];
tl.L.forEach((l, i) => jobs.push([`sc${i + 1}.html`, `fr/s${i + 1}`, Math.ceil(l * 30), false]));
jobs.push(['sc2o.html', 'fr/s2o', Math.ceil(tl.L[1] * 30), true]);
jobs.push(['leakA.html', 'fr/lkA', 27, false]);
jobs.push(['leakB.html', 'fr/lkB', 27, false]);
(async () => {
  const only = process.argv[2];
  const b = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const [html, out, n, tr] of jobs) {
    if (only && !out.endsWith('/' + only)) continue;
    await p.goto('file://' + process.cwd().replace(/\\/g, '/') + '/' + html);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    for (let i = 0; i < n; i++) {
      await p.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), (i / 30) * 1000);
      await p.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png`, omitBackground: tr });
    }
    console.log(out, n);
  }
  await b.close();
})();
