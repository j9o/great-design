#!/usr/bin/env node
// Full-page screenshots of a URL or HTML file, for the great-design critic loop.
//   node ~/.claude/skills/great-design/shoot.cjs <url-or-file> <out-prefix> [widths]
// Default widths 1440,390. Writes <out-prefix>-<width>.png at 2x and prints each path.
// Waits for load + web fonts (8 s cap), scrolls the whole page first so IntersectionObserver / scroll-reveal sections render
// (a stitched capture never fires them), and emulates reduced motion so no transition
// is caught half-way. Resolves playwright from the cwd, then the global npm root.
const path = require('node:path');
function loadChromium() {
  const paths = [process.cwd(), __dirname];
  try { paths.push(require('node:child_process').execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch {}
  for (const pkg of ['playwright', '@playwright/test', 'playwright-core']) {
    try { return require(require.resolve(pkg, { paths })).chromium; } catch {}
  }
  console.error('shoot.cjs: no playwright package found from ' + paths.join(', ') + ' (npm i -g playwright && npx playwright install chromium)');
  process.exit(2);
}
(async () => {
  const [,, target, outPrefix, widthsArg] = process.argv;
  if (!target || !outPrefix) { console.error('usage: node shoot.cjs <url|file> <out-prefix> [1440,390]'); process.exit(2); }
  const url = /^https?:\/\//.test(target) ? target : 'file://' + path.resolve(target);
  const widths = (widthsArg || '1440,390').split(',').map(Number);
  const browser = await loadChromium().launch();
  for (const w of widths) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // 'load' not 'networkidle': Google Fonts / analytics can hold a connection open and hang networkidle.
    await page.goto(url, { waitUntil: 'load' });
    await Promise.race([
      page.evaluate(() => document.fonts ? document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family)) : []).then(f => { if (f.length) console.log('fonts loaded: ' + [...new Set(f)].join(', ')); }),
      new Promise(r => setTimeout(r, 8000)),
    ]);
    await page.evaluate(async () => {
      const step = Math.max(200, window.innerHeight / 2);
      for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    const out = `${outPrefix}-${w}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log(out);
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
