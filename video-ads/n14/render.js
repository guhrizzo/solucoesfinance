const { chromium } = require('../node_modules/playwright');
const fs = require('fs');
// node render.js [t0 t1]  -> renderiza frames (30fps) de video.html
const tl = JSON.parse(fs.readFileSync('timeline.json'));
const N = Math.ceil(tl.total * 30);
const f0 = process.argv[2] ? Math.round(parseFloat(process.argv[2]) * 30) : 0;
const f1 = process.argv[3] ? Math.round(parseFloat(process.argv[3]) * 30) : N;
const clipStart = tl.S[1], clipN = 180;
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + process.cwd().replace(/\\/g, '/') + '/video.html');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  fs.mkdirSync('fr', { recursive: true });
  for (let i = f0; i < f1; i++) {
    const t = i / 30;
    await p.evaluate(async ([ms, src]) => {
      document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; });
      if (src) { const im = document.getElementById('clipimg'); im.src = src; await im.decode().catch(() => {}); }
    }, [t * 1000, (() => { const k = Math.round((t - clipStart) * 30); return k >= 0 ? `clipa_${String(Math.min(k, clipN - 1)).padStart(4, '0')}.jpg` : null; })()]);
    await p.screenshot({ path: `fr/${String(i).padStart(4, '0')}.png` });
    if (i % 60 === 0) console.log(i, '/', N);
  }
  await b.close();
})();
